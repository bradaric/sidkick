import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class DistrictAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_bombard_district_uses_fixed_ranged_submission_and_exact_district_readback(self):
        self.assertTrue(callable(getattr(actions, 'bombard_district', None)))
        args = {'unit_id': 10, 'target_player': 1, 'district_id': 99, 'x': 3, 'y': 3, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}; captured = {'unit_id': 10, 'district_id': 99}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'districtAttackObserved': True}, 'verificationArguments': captured}, {**before, 'districtAttackObserved': True}]) as run:
            self.assertEqual((await actions.bombard_district(10, 1, 99, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('ranged_district_attack.js', args)); self.assertEqual(run.await_args_list[1].args, ('district_attack_state.js', captured))

    async def test_bombard_tool_is_strict_opt_in_and_mutating(self):
        self.assertTrue(callable(getattr(actions, 'bombard_district', None)))
        self.assertNotIn('bombard_civ7_district', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('bombard_civ7_district', tools); self.assertFalse(tools['bombard_civ7_district'].annotations.read_only_hint)
        self.assertTrue(tools['bombard_civ7_district'].annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.bombard_district(True, 1, 99, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('bombard_civ7_district', {'unit_id': 10, 'target_player': 1, 'district_id': True, 'x': 3, 'y': 3, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_district_attack_unknown_and_cancelled_calls_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'bombard_district', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.bombard_district(10, 1, 99, 3, 3, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.bombard_district(10, 1, 99, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
