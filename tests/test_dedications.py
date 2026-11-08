import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class DedicationTests(unittest.IsolatedAsyncioTestCase):
    async def test_readback_mismatch_stays_unknown_without_resubmitting(self):
        self.assertTrue(callable(getattr(actions, 'edit_dedication', None)))
        submitted = {'status': 'submitted', 'before': {'turn': 1, 'age': 42, 'playerId': 0},
                     'expected': {'totalLegacyPoints': 2}}
        async def response(script, arguments=None):
            return submitted if script == 'edit_dedication.js' else {'turn': 1, 'age': 42, 'playerId': 0, 'totalLegacyPoints': 1}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=response) as run, \
                patch('civ7.actions._VERIFICATION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
            result = await actions.edit_dedication('CARD_A', 'add', 'token', 1, 1)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(sum(call.args[0] == 'edit_dedication.js' for call in run.await_args_list), 1)
        self.assertTrue(all(call.args[0] == 'dedication_state.js' for call in run.await_args_list[1:]))

    async def test_edit_is_typed_opt_in_and_uses_shared_verification_once(self):
        self.assertTrue(callable(getattr(actions, 'edit_dedication', None)))
        args = {'card_id': 'CARD_A', 'operation': 'add', 'deck_token': 'token',
                'max_legacy_point_cost': 1, 'expected_turn': 1}
        before = {'turn': 1, 'age': 42, 'playerId': 0}
        expected = {'selectedCardIds': ['CARD_A'], 'totalLegacyPoints': 2, 'selectionComplete': False}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected}, {**before, **expected},
        ]) as run:
            result = await actions.edit_dedication(**args)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list], [
            ('edit_dedication.js', args), ('dedication_state.js',),
        ])
        self.assertNotIn('edit_civ7_dedication', {tool.name for tool in create_server()._tool_manager.list_tools()})
        tool = next(tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()
                    if tool.name == 'edit_civ7_dedication')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)

    async def test_invalid_arguments_and_unknown_or_cancelled_outcomes_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'edit_dedication', None)))
        args = {'card_id': 'CARD_A', 'operation': 'add', 'deck_token': 'token',
                'max_legacy_point_cost': 1, 'expected_turn': 1}
        for changes in ({'expected_turn': True}, {'card_id': ' '}, {'operation': 'confirm'},
                        {'deck_token': ''}, {'max_legacy_point_cost': -1}, {'max_legacy_point_cost': True}):
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await actions.edit_dedication(**{**args, **changes})
                run.assert_not_awaited()
        for error in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(error):
                        await actions.edit_dedication(**args)
                else:
                    self.assertEqual((await actions.edit_dedication(**args))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('edit_civ7_dedication', {**args, 'expected_turn': True})
            run.assert_not_awaited()
