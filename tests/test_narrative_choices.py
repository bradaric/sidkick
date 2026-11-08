import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class NarrativeChoiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_narrative_uses_exact_instance_and_targeted_resolution_readback(self):
        self.assertTrue(callable(getattr(actions, 'choose_narrative', None)))
        before = {'turn': 60, 'age': 42, 'playerId': 0}
        expected = {'instanceId': 15, 'instanceType': 30, 'storyType': 'STORY_TEST', 'resolved': True}
        read_args = {'instance_id': 15, 'instance_type': 30, 'story_type': 'STORY_TEST'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args},
            {**before, **expected}]) as run:
            result = await actions.choose_narrative(15, 30, 'STORY_TEST_CHOICE', 60)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('choose_narrative.js', {
            'instance_id': 15, 'instance_type': 30, 'choice': 'STORY_TEST_CHOICE', 'expected_turn': 60}))
        self.assertEqual(run.await_args_list[1].args, ('narrative_state.js', read_args))

    async def test_narrative_tool_is_strict_and_mutating_only_in_write_mode(self):
        self.assertNotIn('choose_civ7_narrative', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('choose_civ7_narrative', tools)
        tool = tools['choose_civ7_narrative']
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters['required']), {'instance_id', 'instance_type', 'choice', 'expected_turn'})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 30, 'CLOSE', 60), (15, True, 'CLOSE', 60), (15, 30, ' ', 60), (15, 30, 'CLOSE', True)]:
                with self.assertRaises(ValueError):
                    await actions.choose_narrative(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('choose_civ7_narrative', {
                    'instance_id': True, 'instance_type': 30, 'choice': 'CLOSE', 'expected_turn': 60})
            run.assert_not_awaited()

    async def test_narrative_rejection_and_uncertain_outcomes_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'choose_narrative', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.choose_narrative(15, 30, 'CLOSE', 60))['status'], 'rejected')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.choose_narrative(15, 30, 'CLOSE', 60))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.choose_narrative(15, 30, 'CLOSE', 60)
            self.assertEqual(run.await_count, 1)
