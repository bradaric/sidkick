import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ArmyRangedAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_army_ranged_attack_uses_fixed_command_script_and_captured_participants(self):
        self.assertTrue(callable(getattr(actions, 'army_ranged_attack', None)))
        args = {'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'unitId': 30, 'attackObserved': True}
        captured = {'unit_id': 30, 'participants': [{'unit_id': 10, 'before_attacks': 1}]}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': captured}, {**before, **expected}]) as run:
            self.assertEqual((await actions.army_ranged_attack(30, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('army_ranged_attack.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_army_ranged_tool_is_opt_in_strict_and_mutating(self):
        self.assertNotIn('ranged_attack_civ7_army', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('ranged_attack_civ7_army', set(tools))
        tool = tools['ranged_attack_civ7_army']
        self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.army_ranged_attack(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('ranged_attack_civ7_army', {
                    'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_army_ranged_uncertainty_never_reissues_the_command(self):
        self.assertTrue(callable(getattr(actions, 'army_ranged_attack', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.army_ranged_attack(30, 1, 20, 3, 3, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.army_ranged_attack(30, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
