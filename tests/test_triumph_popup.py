import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import actions
from sidkick.server import create_server


BEFORE = {'turn': 63, 'age': -123, 'playerId': 0}
SUBMITTED = {'status': 'submitted', 'before': BEFORE,
             'expected': {'capturedPopupClosed': True, 'balancesUnchanged': True},
             'verificationArguments': {'request_id': 'closing'}}


class TriumphPopupTests(unittest.IsolatedAsyncioTestCase):
    async def test_close_is_opt_in_and_submits_once_with_read_only_popup_verification(self):
        name = 'close_civ7_triumph_popup'
        self.assertNotIn(name, {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertTrue(name in enabled, name)
        self.assertFalse(enabled[name].annotations.read_only_hint)
        self.assertTrue(enabled[name].annotations.destructive_hint)
        self.assertFalse(enabled[name].annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[SUBMITTED,
            {**BEFORE, 'capturedPopupClosed': False, 'balancesUnchanged': True},
            {**BEFORE, 'capturedPopupClosed': True, 'balancesUnchanged': True}]) as run, \
                patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.close_triumph_popup('fresh-popup', 63)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([c.args[0] for c in run.await_args_list], ['close_triumph_popup.js', 'triumph_popup_state.js', 'triumph_popup_state.js'])
        self.assertEqual(run.await_args_list[0].args[1]['popup_token'], 'fresh-popup')
        self.assertEqual(run.await_args_list[0].args[1]['expected_turn'], 63)

    async def test_uncertain_cancelled_or_context_changed_closure_never_sends_second_input(self):
        for effects in ([TimeoutError], [SUBMITTED, TimeoutError], [SUBMITTED, {**BEFORE, 'turn': 64}]):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=effects) as run:
                self.assertEqual((await actions.close_triumph_popup('fresh', 63))['status'], 'unknown')
                self.assertEqual(run.await_count, len(effects))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[SUBMITTED, asyncio.CancelledError]) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.close_triumph_popup('fresh', 63)
            self.assertEqual(run.await_count, 2)

    async def test_invalid_input_never_reaches_transport(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for token, turn in [('', 63), (True, 63), ('fresh', True), ('fresh', -1), ('x' * 100001, 63)]:
                with self.assertRaises(ValueError): await actions.close_triumph_popup(token, turn)
            run.assert_not_awaited()
