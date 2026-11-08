import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class UnitPromotionTests(unittest.IsolatedAsyncioTestCase):
    async def test_promotion_submits_once_and_verifies_captured_unit_and_promotion(self):
        self.assertTrue(callable(getattr(actions, 'promote_unit', None)))
        args = {'unit_id': 10, 'discipline': 'DISCIPLINE_TEST', 'promotion': 'PROMOTION_TEST', 'expected_turn': 62}
        expected = {'unitId': 10, 'unitType': 500, 'discipline': 'DISCIPLINE_TEST', 'promotion': 'PROMOTION_TEST', 'hasPromotion': True}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': args}, {**before, **expected}]) as run:
            result = await actions.promote_unit(10, 'DISCIPLINE_TEST', 'PROMOTION_TEST', 62)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('promote_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_promotion_state.js', args))

    async def test_promotion_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('promote_civ7_unit', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('promote_civ7_unit', tools)
        tool = tools['promote_civ7_unit']
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 'D', 'P', 62), (10, ' ', 'P', 62), (10, 'D', ' ', 62), (10, 'D', 'P', True)]:
                with self.assertRaises(ValueError):
                    await actions.promote_unit(*args)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('promote_civ7_unit', {
                    'unit_id': True, 'discipline': 'D', 'promotion': 'P', 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_promotion_rejections_and_uncertainty_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'promote_unit', None)))
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.promote_unit(10, 'D', 'P', 62))['status'], status)
                self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.promote_unit(10, 'D', 'P', 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.promote_unit(10, 'D', 'P', 62)
            self.assertEqual(run.await_count, 1)
