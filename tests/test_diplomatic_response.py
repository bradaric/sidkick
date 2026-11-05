import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class DiplomaticResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_response_wraps_one_capped_native_submission_and_identity_readback(self):
        self.assertTrue(callable(getattr(actions, 'respond_diplomatic_project', None)))
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'actionId': 76, 'initialPlayer': 1, 'response': 'support'}
        read_args = {'action_id': 76, 'initial_player': 1, 'action': 'DIPLOMACY_ACTION_CULTURAL_EXCHANGE'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args},
            {**before, **expected}]) as run:
            self.assertEqual((await actions.respond_diplomatic_project(76, 'support', 180, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('respond_diplomatic_project.js', {
            'action_id': 76, 'response': 'support', 'max_influence_cost': 180, 'expected_turn': 62}))
        self.assertEqual(run.await_args_list[1].args, ('diplomatic_response_state.js', read_args))

    async def test_response_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('respond_civ7_diplomatic_project', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('respond_civ7_diplomatic_project', tools)
        tool = tools['respond_civ7_diplomatic_project']
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters['required']), {'action_id', 'response', 'max_influence_cost', 'expected_turn'})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 'accept', 0, 62), (76, 'war', 0, 62), (76, 'accept', True, 62),
                         (76, 'accept', float('nan'), 62), (76, 'accept', -1, 62), (76, 'accept', 0, True)]:
                with self.assertRaises(ValueError):
                    await actions.respond_diplomatic_project(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('respond_civ7_diplomatic_project', {
                    'action_id': 76, 'response': 'war', 'max_influence_cost': 0, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_response_rejection_and_uncertain_outcomes_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'respond_diplomatic_project', None)))
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.respond_diplomatic_project(76, 'accept', 0, 62))['status'], status)
                self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.respond_diplomatic_project(76, 'accept', 0, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.respond_diplomatic_project(76, 'accept', 0, 62)
            self.assertEqual(run.await_count, 1)
