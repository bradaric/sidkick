import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ReinforceUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_reinforcement_uses_captured_assignment_identity_and_no_submission_retry(self):
        self.assertTrue(callable(getattr(actions, 'reinforce_unit', None)))
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        args = {'unit_id': 20, 'commander_id': 10, 'expected_turn': 62}
        read_args = {**args, 'target_army_id': 10, 'component_type': 26, 'commander_component_type': 26}
        expected = {'unitId': 20, 'commanderId': 10, 'reinforcing': True}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args}, {**before, **expected}]) as run:
            self.assertEqual((await actions.reinforce_unit(20, 10, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('reinforce_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('reinforcement_state.js', read_args))

    async def test_reinforcement_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('reinforce_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('reinforce_civ7_unit', tools)
        tool = tools['reinforce_civ7_unit']
        self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 10, 62), (20, True, 62), (20, 10, True)]:
                with self.assertRaises(ValueError): await actions.reinforce_unit(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('reinforce_civ7_unit', {'unit_id': True, 'commander_id': 10, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_reinforcement_noops_rejections_timeout_and_cancel_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'reinforce_unit', None)))
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.reinforce_unit(20, 10, 62))['status'], status); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.reinforce_unit(20, 10, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.reinforce_unit(20, 10, 62)
            self.assertEqual(run.await_count, 1)
