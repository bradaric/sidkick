import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class OverrunTests(unittest.IsolatedAsyncioTestCase):
    async def test_overrun_submits_once_and_verifies_captured_packed_army_and_target(self):
        self.assertTrue(callable(getattr(actions, 'army_overrun', None)))
        args = {'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'commanderId': 30, 'overrunObserved': True}
        captured = {'mode': 'overrun', **args, 'baseline_packed_unit_ids': [10], 'before_moves': 2}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': captured}, {**before, **expected}]) as run:
            self.assertEqual((await actions.army_overrun(30, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('army_overrun.js', args))
        self.assertEqual(run.await_args_list[1].args, ('commander_action_state.js', captured))

    async def test_overrun_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('overrun_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('overrun_civ7_unit', set(enabled))
        self.assertFalse(enabled['overrun_civ7_unit'].annotations.read_only_hint)
        self.assertTrue(enabled['overrun_civ7_unit'].annotations.destructive_hint)
        self.assertFalse(enabled['overrun_civ7_unit'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.army_overrun(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('overrun_civ7_unit', {
                    'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_overrun_unknown_and_cancelled_outcomes_do_not_retry(self):
        self.assertTrue(callable(getattr(actions, 'army_overrun', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.army_overrun(30, 1, 20, 3, 3, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.army_overrun(30, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
