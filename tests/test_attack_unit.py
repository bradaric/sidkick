import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class AttackUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_attack_submits_once_and_verifies_captured_combat_evidence(self):
        self.assertTrue(callable(getattr(actions, 'attack_unit', None)))
        args = {'unit_id': 10, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'kind': 'melee', 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'unitId': 10, 'targetPlayer': 1, 'targetUnitId': 20, 'attackObserved': True}
        read_args = {**args, 'before_attacks': 1, 'before_target_damage': 0}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args}, {**before, **expected}]) as run:
            self.assertEqual((await actions.attack_unit(10, 1, 20, 3, 3, 'melee', 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('attack_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_attack_state.js', read_args))

    async def test_attack_is_strict_mutating_opt_in(self):
        self.assertNotIn('attack_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('attack_civ7_unit', tools)
        tool = tools['attack_civ7_unit']
        self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 1, 20, 3, 3, 'melee', 62), (10, 1, 20, 3, 3, 'air', 62), (10, 1, 20, 3, 3, 'melee', True)]:
                with self.assertRaises(ValueError): await actions.attack_unit(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('attack_civ7_unit', {
                    'unit_id': True, 'target_player': 1, 'target_unit_id': 20, 'x': 3, 'y': 3, 'kind': 'melee', 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_rejected_timeout_and_cancelled_attacks_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'attack_unit', None)))
        args = (10, 1, 20, 3, 3, 'ranged', 62)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.attack_unit(*args))['status'], 'rejected'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.attack_unit(*args))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.attack_unit(*args)
            self.assertEqual(run.await_count, 1)
