import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ArmyUpgradeTests(unittest.IsolatedAsyncioTestCase):
    async def test_upgrade_army_submits_once_and_verifies_captured_inventory_and_gold(self):
        self.assertTrue(callable(getattr(actions, 'upgrade_army', None)))
        args = {'commander_id': 30, 'max_gold_cost': 400.0, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'baseline': {**before, 'plan': []}}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'upgradeObserved': True}, 'verificationArguments': captured},
            {**before, 'upgradeObserved': True}]) as run:
            self.assertEqual((await actions.upgrade_army(30, 400.0, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('upgrade_army.js', args))
        self.assertEqual(run.await_args_list[1].args, ('army_upgrade_state.js', captured))

    async def test_upgrade_army_tool_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('upgrade_civ7_army', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('upgrade_civ7_army', set(enabled))
        self.assertFalse(enabled['upgrade_civ7_army'].annotations.read_only_hint)
        self.assertTrue(enabled['upgrade_civ7_army'].annotations.destructive_hint)
        self.assertFalse(enabled['upgrade_civ7_army'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 400.0, 62), (30, True, 62), (30, float('inf'), 62)]:
                with self.assertRaises(ValueError): await actions.upgrade_army(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('upgrade_civ7_army', {'commander_id': 30, 'max_gold_cost': True, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_group_upgrade_rejection_uncertainty_and_cancellation_never_repeat(self):
        self.assertTrue(callable(getattr(actions, 'upgrade_army', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.upgrade_army(30, 400.0, 62))['status'], 'rejected'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.upgrade_army(30, 400.0, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.upgrade_army(30, 400.0, 62)
            self.assertEqual(run.await_count, 1)
