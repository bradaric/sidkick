import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class PillageTests(unittest.IsolatedAsyncioTestCase):
    async def test_coastal_raid_uses_fixed_kind_and_opt_in_tool(self):
        self.assertTrue(callable(getattr(actions, 'coastal_raid', None)))
        args = {'unit_id': 10, 'target_player': 1, 'x': 3, 'y': 3, 'target_token': '[]', 'expected_turn': 62, 'kind': 'coastal'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.coastal_raid(10, 1, 3, 3, '[]', 62))['status'], 'rejected')
        self.assertEqual(run.await_args.args, ('pillage_tile.js', args))
        self.assertNotIn('coastal_raid_civ7_tile', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}.get('coastal_raid_civ7_tile')
        self.assertIsNotNone(tool); self.assertFalse(tool.annotations.read_only_hint)

    async def test_pillage_submits_once_then_verifies_native_damage(self):
        self.assertTrue(callable(getattr(actions, 'pillage_tile', None)))
        args = {'unit_id': 10, 'target_player': 1, 'x': 3, 'y': 3, 'target_token': '[captured]', 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}; captured = {'unit_id': 10, 'baseline_constructibles': []}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'pillageObserved': True}, 'verificationArguments': captured}, {**before, 'pillageObserved': True}]) as run:
            self.assertEqual((await actions.pillage_tile(10, 1, 3, 3, '[captured]', 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('pillage_tile.js', args)); self.assertEqual(run.await_args_list[1].args, ('pillage_state.js', captured))

    async def test_pillage_is_strict_opt_in_and_never_retried(self):
        self.assertTrue(callable(getattr(actions, 'pillage_tile', None)))
        self.assertNotIn('pillage_civ7_tile', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}.get('pillage_civ7_tile')
        self.assertIsNotNone(tool); self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.pillage_tile(True, 1, 3, 3, '[]', 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('pillage_civ7_tile', {'unit_id': True, 'target_player': 1, 'x': 3, 'y': 3, 'target_token': '[]', 'expected_turn': 62})
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.pillage_tile(10, 1, 3, 3, '[]', 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.pillage_tile(10, 1, 3, 3, '[]', 62)
            self.assertEqual(run.await_count, 1)
