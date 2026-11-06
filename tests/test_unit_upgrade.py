import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class UnitUpgradeTests(unittest.IsolatedAsyncioTestCase):
    async def test_upgrade_wraps_fixed_script_and_same_unit_type_verification(self):
        self.assertTrue(callable(getattr(actions, 'upgrade_unit', None)))
        args = {'unit_id': 10, 'target_unit_type': 'UNIT_NEW', 'max_gold_cost': 200, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'originalUnitId': 10, 'unitType': 'UNIT_NEW', 'upgradeObserved': True}
        read_args = {'unit_id': 10, 'target_unit_type': 'UNIT_NEW', 'baseline_unit_ids': [10],
                     'source_location': {'x': 2, 'y': 3}, 'source_component_type': 26, 'before_gold': 1000, 'quoted_gold_cost': 200}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args},
            {**before, **expected, 'unitId': 20}]) as run:
            self.assertEqual((await actions.upgrade_unit(10, 'UNIT_NEW', 200, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('upgrade_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_upgrade_state.js', read_args))

    async def test_upgrade_tool_is_strict_opt_in_and_mutating(self):
        self.assertNotIn('upgrade_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('upgrade_civ7_unit', tools)
        tool = tools['upgrade_civ7_unit']
        self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 'UNIT_NEW', 200, 62), (10, ' ', 200, 62), (10, 'UNIT_NEW', True, 62),
                         (10, 'UNIT_NEW', float('inf'), 62), (10, 'UNIT_NEW', -1, 62), (10, 'UNIT_NEW', 200, True)]:
                with self.assertRaises(ValueError): await actions.upgrade_unit(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('upgrade_civ7_unit', {
                    'unit_id': 10, 'target_unit_type': 'UNIT_NEW', 'max_gold_cost': True, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_upgrade_noops_rejections_and_uncertainty_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'upgrade_unit', None)))
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.upgrade_unit(10, 'UNIT_NEW', 200, 62))['status'], status)
                self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.upgrade_unit(10, 'UNIT_NEW', 200, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.upgrade_unit(10, 'UNIT_NEW', 200, 62)
            self.assertEqual(run.await_count, 1)
