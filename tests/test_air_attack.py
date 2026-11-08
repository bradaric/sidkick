import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class AirAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_air_strike_submits_once_and_verifies_captured_base_and_target(self):
        self.assertTrue(callable(getattr(actions, 'air_attack_unit', None)))
        args = {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}; captured = {'unit_id': 10, 'baseline_armies': []}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'airAttackObserved': True}, 'verificationArguments': captured}, {**before, 'airAttackObserved': True}]) as run:
            self.assertEqual((await actions.air_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('air_attack_unit.js', args)); self.assertEqual(run.await_args_list[1].args, ('air_attack_state.js', captured))

    async def test_air_strike_is_strict_opt_in_and_never_retried(self):
        self.assertTrue(callable(getattr(actions, 'air_attack_unit', None)))
        self.assertNotIn('air_attack_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}.get('air_attack_civ7_unit')
        self.assertIsNotNone(tool); self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.air_attack_unit(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('air_attack_civ7_unit', {'unit_id': 10, 'target_player': True, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62})
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.air_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.air_attack_unit(10, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
