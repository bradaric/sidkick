import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class ResourceMutationTests(unittest.IsolatedAsyncioTestCase):
    async def test_resource_swap_submits_once_then_verifies_the_complete_assignment_ledger(self):
        self.assertTrue(callable(getattr(actions, 'swap_resources', None)))
        args = {'first_resource_instance': 7, 'first_off_map': False, 'second_resource_instance': 7, 'second_off_map': True, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {'expected_assignments': []}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'swapObserved': True}, 'verificationArguments': captured}, {**before, 'swapObserved': True}]) as run:
            self.assertEqual((await actions.swap_resources(7, False, 7, True, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('swap_resources.js', args))
        self.assertEqual(run.await_args_list[1].args, ('resource_swap_state.js', captured))

    async def test_resource_swap_is_strict_opt_in_and_never_retries_unknown(self):
        self.assertTrue(callable(getattr(actions, 'swap_resources', None)))
        self.assertNotIn('swap_civ7_resources', {t.name for t in create_server()._tool_manager.list_tools()})
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('swap_civ7_resources', tools); self.assertFalse(tools['swap_civ7_resources'].annotations.read_only_hint)
        self.assertTrue(tools['swap_civ7_resources'].annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.swap_resources(7, False, 7, False, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('swap_civ7_resources', {'first_resource_instance': 7, 'first_off_map': 1, 'second_resource_instance': 7, 'second_off_map': True, 'expected_turn': 62})
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.swap_resources(7, False, 7, True, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.swap_resources(7, False, 7, True, 62)
            self.assertEqual(run.await_count, 1)

    async def test_resource_unassign_has_exact_identity_and_separate_readback(self):
        self.assertTrue(callable(getattr(actions, 'unassign_resource', None)))
        args = {'resource_instance': 7, 'off_map': False, 'settlement': 'Home', 'expected_turn': 62, 'mode': 'unassign'}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'resource': {'instance': 7, 'offMap': False}, 'assignedCityId': None}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected}, {**before, **expected}]) as run:
            self.assertEqual((await actions.unassign_resource(7, False, 'Home', 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('assign_resource.js', args))
        self.assertEqual(run.await_args_list[1].args, ('resource_assignment_state.js', args))

    async def test_resource_unassign_is_strict_opt_in_and_never_retried(self):
        self.assertTrue(callable(getattr(actions, 'unassign_resource', None)))
        self.assertNotIn('unassign_civ7_resource', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}.get('unassign_civ7_resource')
        self.assertIsNotNone(tool); self.assertFalse(tool.annotations.read_only_hint); self.assertTrue(tool.annotations.destructive_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.unassign_resource(7, 1, 'Home', 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('unassign_civ7_resource', {'resource_instance': 7, 'off_map': 1, 'settlement': 'Home', 'expected_turn': 62})
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.unassign_resource(7, False, 'Home', 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.unassign_resource(7, False, 'Home', 62)
            self.assertEqual(run.await_count, 1)
