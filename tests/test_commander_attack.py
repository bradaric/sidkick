import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class CommanderAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_direct_attack_submits_once_and_verifies_commander_spend_and_target_effect(self):
        self.assertTrue(callable(getattr(actions, 'commander_attack', None)))
        args = {'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'unit_id': 30, 'commander_attack': True, 'before_moves': 2}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'abilityAttackObserved': True}, 'verificationArguments': captured}, {**before, 'abilityAttackObserved': True}]) as run:
            self.assertEqual((await actions.commander_attack(30, 1, 20, 3, 3, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('commander_attack.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', captured))

    async def test_commander_attack_is_strict_opt_in_and_mutating(self):
        self.assertTrue(callable(getattr(actions, 'commander_attack', None)))
        self.assertNotIn('attack_civ7_commander', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('attack_civ7_commander', tools); self.assertFalse(tools['attack_civ7_commander'].annotations.read_only_hint)
        self.assertTrue(tools['attack_civ7_commander'].annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.commander_attack(True, 1, 20, 3, 3, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('attack_civ7_commander', {'commander_id': 30, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_direct_commander_uncertainty_and_cancellation_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'commander_attack', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.commander_attack(30, 1, 20, 3, 3, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.commander_attack(30, 1, 20, 3, 3, 62)
            self.assertEqual(run.await_count, 1)
