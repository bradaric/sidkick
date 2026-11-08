import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class SecondWindTests(unittest.IsolatedAsyncioTestCase):
    async def test_second_wind_submits_once_and_verifies_captured_recipient(self):
        self.assertTrue(callable(getattr(actions, 'grant_second_wind', None)))
        args = {'commander_id': 30, 'unit_id': 10, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        captured = {**args, 'before_moves': 0, 'before_attacks': 0}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'secondWindObserved': True}, 'verificationArguments': captured},
            {**before, 'secondWindObserved': True}]) as run:
            self.assertEqual((await actions.grant_second_wind(30, 10, 62))['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('second_wind.js', args))
        self.assertEqual(run.await_args_list[1].args, ('second_wind_state.js', captured))

    async def test_second_wind_is_strict_mutating_and_opt_in(self):
        self.assertNotIn('grant_civ7_second_wind', {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('grant_civ7_second_wind', set(enabled))
        self.assertFalse(enabled['grant_civ7_second_wind'].annotations.read_only_hint)
        self.assertTrue(enabled['grant_civ7_second_wind'].annotations.destructive_hint)
        self.assertFalse(enabled['grant_civ7_second_wind'].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.grant_second_wind(True, 10, 62)
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('grant_civ7_second_wind', {
                    'commander_id': 30, 'unit_id': 10, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_second_wind_unknown_cancelled_and_native_rejected_are_not_retried(self):
        self.assertTrue(callable(getattr(actions, 'grant_second_wind', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.grant_second_wind(30, 10, 62))['status'], 'rejected')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.grant_second_wind(30, 10, 62))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.grant_second_wind(30, 10, 62)
            self.assertEqual(run.await_count, 1)
