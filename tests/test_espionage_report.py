import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import actions
from sidkick.server import create_server


class EspionageReportTests(unittest.IsolatedAsyncioTestCase):
    async def test_report_tool_is_opt_in_and_opens_then_continues_once_with_read_only_polling(self):
        self.assertTrue(callable(getattr(actions, 'acknowledge_espionage_report', None)))
        self.assertNotIn('acknowledge_civ7_espionage_report', {t.name for t in create_server()._tool_manager.list_tools()})
        server = create_server(enable_writes=True)
        tool = next(t for t in server._tool_manager.list_tools() if t.name == 'acknowledge_civ7_espionage_report')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        args = {'notification_id': 307, 'component_type': 20, 'report_token': 'fresh', 'expected_turn': 40}
        before = {'turn': 40, 'age': 42, 'playerId': 0}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before},
            {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'closed', 'acknowledged': True, 'popupClosed': True},
            {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'matching', 'acknowledged': True, 'popupClosed': False},
            {'status': 'submitted'},
            {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'closed', 'acknowledged': True, 'popupClosed': True},
        ]) as run, patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await server.call_tool('acknowledge_civ7_espionage_report', args)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        self.assertEqual([call.args[0] for call in run.await_args_list], [
            'acknowledge_espionage_report.js', 'espionage_report_state.js', 'espionage_report_state.js',
            'acknowledge_espionage_report.js', 'espionage_report_state.js'])
        self.assertEqual(run.await_args_list[0].args[1], {**args, 'phase': 'open'})
        self.assertEqual(run.await_args_list[3].args[1], {'phase': 'continue', 'before': before})

    async def test_unknown_cancelled_or_mismatched_ui_never_reactivates_or_retries_continue(self):
        self.assertTrue(callable(getattr(actions, 'acknowledge_espionage_report', None)))
        args = {'notification_id': 307, 'component_type': 20, 'report_token': 'fresh', 'expected_turn': 40}
        before = {'turn': 40, 'age': 42, 'playerId': 0}
        for following in [TimeoutError, asyncio.CancelledError,
                          {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'other'},
                          {**before, 'identityUnchanged': False, 'balancesUnchanged': True, 'uiStatus': 'matching'}]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[{'status': 'submitted', 'before': before}, following]) as run:
                if following is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.acknowledge_espionage_report(**args)
                else:
                    self.assertEqual((await actions.acknowledge_espionage_report(**args))['status'], 'unknown')
                self.assertEqual(run.await_count, 2)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.acknowledge_espionage_report(**args))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)

    async def test_invalid_input_rejects_before_transport(self):
        self.assertTrue(callable(getattr(actions, 'acknowledge_espionage_report', None)))
        args = {'notification_id': 307, 'component_type': 20, 'report_token': 'fresh', 'expected_turn': 40}
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for change in [{'notification_id': True}, {'component_type': -1}, {'expected_turn': True}, {'report_token': ''}]:
                with self.assertRaises(ValueError):
                    await actions.acknowledge_espionage_report(**{**args, **change})
            run.assert_not_awaited()

    async def test_timeout_waiting_for_popup_never_reactivates_or_presses_unseen_continue(self):
        before = {'turn': 40, 'age': 42, 'playerId': 0}
        async def pending(script, arguments):
            if script == 'acknowledge_espionage_report.js':
                return {'status': 'submitted', 'before': before}
            return {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'closed',
                    'acknowledged': True, 'popupClosed': True}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=pending) as run, \
                patch('civ7.actions._COMBAT_VERIFICATION_TIMEOUT', 0.01):
            result = await actions.acknowledge_espionage_report(307, 20, 'fresh', 40)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['phase'], 'open')
        writes = [call for call in run.await_args_list if call.args[0] == 'acknowledge_espionage_report.js']
        self.assertEqual(len(writes), 1)

    async def test_uncertain_continue_never_clicks_again_or_attempts_cleanup_after_cancellation(self):
        before = {'turn': 40, 'age': 42, 'playerId': 0}
        ready = {**before, 'identityUnchanged': True, 'balancesUnchanged': True, 'uiStatus': 'matching'}
        for failure in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': before}, ready, failure]) as run:
                if failure is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.acknowledge_espionage_report(307, 20, 'fresh', 40)
                else:
                    result = await actions.acknowledge_espionage_report(307, 20, 'fresh', 40)
                    self.assertEqual(result['status'], 'unknown')
                    self.assertEqual(result['phase'], 'continue')
                self.assertEqual(run.await_count, 3)
