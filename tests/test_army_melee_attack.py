import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ArmyMeleeAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_coordinated_melee_submits_one_fixed_command_and_verifies_actual_participants(self):
        self.assertTrue(callable(getattr(actions, 'army_melee_attack', None)))
        arguments = {'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62, 'attack_kind': 'melee'}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 30, 'participants': [{'unit_id': 10, 'before_attacks': 1}]}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'attackObserved': True}, 'verificationArguments': captured},
            {**before, 'attackObserved': True}]) as run:
            self.assertEqual((await actions.army_melee_attack(30, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('army_attack.js', arguments))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_coordinated_melee_tool_is_strict_opt_in_and_mutating(self):
        self.assertNotIn('melee_attack_civ7_army', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('melee_attack_civ7_army', set(enabled))
        self.assertFalse(enabled['melee_attack_civ7_army'].annotations.read_only_hint)
        self.assertTrue(enabled['melee_attack_civ7_army'].annotations.destructive_hint)
        self.assertFalse(enabled['melee_attack_civ7_army'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.army_melee_attack(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('melee_attack_civ7_army', {
                    'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_uncertain_or_cancelled_coordinated_melee_is_never_repeated(self):
        self.assertTrue(callable(getattr(actions, 'army_melee_attack', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.army_melee_attack(30, 1, 20, 3, 3, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.army_melee_attack(30, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
