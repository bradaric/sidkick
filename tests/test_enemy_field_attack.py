import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class EnemyFieldTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_melee_field_wrapper_preserves_native_attack_and_noncentre_scope(self):
        self.assertTrue(callable(getattr(actions, 'melee_attack_enemy_field', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await actions.melee_attack_enemy_field(10, 1, 20, 3, 3, 62)
        self.assertEqual(run.await_args.args, ('attack_unit.js', {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3,
            'expected_turn': 62, 'kind': 'melee', 'target_territory': 'enemy_field', 'observe_effects': True, 'observation_radius': 1}))
        self.assertNotIn('melee_attack_civ7_enemy_field', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('melee_attack_civ7_enemy_field', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})

    async def test_enemy_field_wrapper_is_ranged_only_and_verifies_exact_primary_target(self):
        self.assertTrue(callable(getattr(actions, 'ranged_attack_enemy_field', None)))
        args = {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62,
                'kind': 'ranged', 'target_territory': 'enemy_field', 'observe_effects': True, 'observation_radius': 1}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 10, 'before_attacks': 1, 'target_unit_id': 20}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'attackObserved': True}, 'verificationArguments': captured},
            {**before, 'attackObserved': True}]) as run:
            self.assertEqual((await actions.ranged_attack_enemy_field(10, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('attack_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_enemy_field_tool_is_strict_opt_in_and_mutating(self):
        self.assertNotIn('ranged_attack_civ7_enemy_field', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('ranged_attack_civ7_enemy_field', set(enabled))
        self.assertFalse(enabled['ranged_attack_civ7_enemy_field'].annotations.read_only_hint)
        self.assertTrue(enabled['ranged_attack_civ7_enemy_field'].annotations.destructive_hint)
        self.assertFalse(enabled['ranged_attack_civ7_enemy_field'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.ranged_attack_enemy_field(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('ranged_attack_civ7_enemy_field', {
                    'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_enemy_field_uncertainty_and_cancellation_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'ranged_attack_enemy_field', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.ranged_attack_enemy_field(10, 1, 20, 3, 3, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.ranged_attack_enemy_field(10, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
