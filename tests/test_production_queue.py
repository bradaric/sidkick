import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ProductionQueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_edits_submit_once_and_verify_complete_ordered_queue(self):
        self.assertTrue(callable(getattr(actions, 'edit_production_queue', None)))
        for action, other in [('cancel', None), ('swap', 2)]:
            args = {'settlement': 'Home', 'queue_token': '[captured]', 'action': action, 'index': 1, 'other_index': other, 'expected_turn': 62}
            before = {'turn': 62, 'age': 42, 'playerId': 0}
            captured = {'city_id': 10, 'component_type': 1}
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': before, 'expected': {'cityId': 10, 'queue': []}, 'verificationArguments': captured}, {**before, 'cityId': 10, 'queue': []}]) as run:
                self.assertEqual((await actions.edit_production_queue('Home', '[captured]', action, 1, 62, other))['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args, ('edit_production_queue.js', args))
            self.assertEqual(run.await_args_list[1].args, ('production_queue_state.js', captured))

    async def test_queue_edit_tool_is_strict_opt_in_and_mutating(self):
        self.assertTrue(callable(getattr(actions, 'edit_production_queue', None)))
        self.assertNotIn('edit_civ7_production_queue', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('edit_civ7_production_queue', tools); self.assertFalse(tools['edit_civ7_production_queue'].annotations.read_only_hint)
        self.assertTrue(tools['edit_civ7_production_queue'].annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.edit_production_queue('Home', '[]', 'cancel', True, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('edit_civ7_production_queue', {'settlement': 'Home', 'queue_token': '[]', 'action': 'cancel', 'index': True, 'expected_turn': 62})
            run.assert_not_awaited()

    async def test_queue_unknown_cancelled_and_rejected_calls_never_repeat(self):
        self.assertTrue(callable(getattr(actions, 'edit_production_queue', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.edit_production_queue('Home', '[]', 'cancel', 1, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.edit_production_queue('Home', '[]', 'cancel', 1, 62)
            self.assertEqual(run.await_count, 1)
