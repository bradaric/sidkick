import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class RebaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_rebase_submits_once_and_verifies_exact_captured_aircraft_and_city(self):
        self.assertTrue(callable(getattr(actions, 'rebase_aircraft', None)))
        args = {'unit_id': 10, 'target_city_id': 7, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {**args, 'unit_type': 100, 'destination': {'x': 5, 'y': 5}}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'rebaseObserved': True}, 'verificationArguments': captured},
            {**before, 'rebaseObserved': True}]) as run:
            self.assertEqual((await actions.rebase_aircraft(10, 7, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('rebase_unit.js', args))
        self.assertEqual(run.await_args_list[1].args, ('unit_rebase_state.js', captured))

    async def test_rebase_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('rebase_civ7_aircraft', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('rebase_civ7_aircraft', set(enabled))
        self.assertFalse(enabled['rebase_civ7_aircraft'].annotations.read_only_hint)
        self.assertTrue(enabled['rebase_civ7_aircraft'].annotations.destructive_hint)
        self.assertFalse(enabled['rebase_civ7_aircraft'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.rebase_aircraft(True, 7, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('rebase_civ7_aircraft', {'unit_id': 10, 'target_city_id': 7, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_rebase_unknown_cancelled_rejected_and_noop_never_repeat(self):
        self.assertTrue(callable(getattr(actions, 'rebase_aircraft', None)))
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.rebase_aircraft(10, 7, 62))['status'], status); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.rebase_aircraft(10, 7, 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.rebase_aircraft(10, 7, 62)
            self.assertEqual(run.await_count, 1)
