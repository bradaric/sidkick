import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class NavalAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_naval_attack_submits_once_and_uses_existing_exact_combat_readback(self):
        self.assertTrue(callable(getattr(actions, 'naval_attack_unit', None)))
        args = {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62, 'kind': 'naval'}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 10, 'before_attacks': 1, 'target_unit_id': 20}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'attackObserved': True}, 'verificationArguments': captured},
            {**before, 'attackObserved': True}]) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('attack_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_naval_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('naval_attack_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('naval_attack_civ7_unit', set(enabled))
        self.assertFalse(enabled['naval_attack_civ7_unit'].annotations.read_only_hint)
        self.assertTrue(enabled['naval_attack_civ7_unit'].annotations.destructive_hint)
        self.assertFalse(enabled['naval_attack_civ7_unit'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.naval_attack_unit(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('naval_attack_civ7_unit', {
                    'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_naval_unknown_cancelled_rejected_calls_never_repeat(self):
        self.assertTrue(callable(getattr(actions, 'naval_attack_unit', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'rejected'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.naval_attack_unit(10, 1, 20, 3, 3, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.naval_attack_unit(10, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
