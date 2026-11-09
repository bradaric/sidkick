import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


NAME = 'acknowledge_civ7_town_focus_reminder'
ARGS = {'notification_id': 499, 'component_type': 20, 'expected_turn': 63}
BEFORE = {'turn': 63, 'age': -123, 'playerId': 0}
EXPECTED = {'notificationId': 499, 'componentType': 20, 'townId': 524295,
            'acknowledged': True, 'focusUnchanged': True, 'goldUnchanged': True}
READ_ARGS = {'notification_id': 499, 'component_type': 20, 'town_id': 524295}
SUBMITTED = {'status': 'submitted', 'before': BEFORE, 'expected': EXPECTED, 'verificationArguments': READ_ARGS}


class TownFocusReminderTests(unittest.IsolatedAsyncioTestCase):
    async def test_acknowledgement_submits_once_and_polls_only_targeted_readback(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            SUBMITTED, {**BEFORE, **EXPECTED, 'acknowledged': False}, {**BEFORE, **EXPECTED},
        ]) as run, patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.acknowledge_town_focus(**ARGS)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([c.args for c in run.await_args_list], [('acknowledge_town_focus.js', ARGS),
            ('town_focus_reminder_state.js', READ_ARGS), ('town_focus_reminder_state.js', READ_ARGS)])

    async def test_rejected_noop_unknown_and_cancelled_outcomes_never_resubmit(self):
        for status in ('rejected', 'already_active'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.acknowledge_town_focus(**ARGS))['status'], status)
                self.assertEqual(run.await_count, 1)
        for effects in ([TimeoutError], [SUBMITTED, TimeoutError], [SUBMITTED, {**BEFORE, **EXPECTED, 'turn': 64}]):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=effects) as run:
                self.assertEqual((await actions.acknowledge_town_focus(**ARGS))['status'], 'unknown')
                self.assertEqual(run.await_count, len(effects))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[SUBMITTED, asyncio.CancelledError]) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.acknowledge_town_focus(**ARGS)
            self.assertEqual(run.await_count, 2)

    async def test_changed_focus_cannot_verify_even_when_notification_was_cleared(self):
        async def execute(script, arguments):
            return SUBMITTED if script == 'acknowledge_town_focus.js' else {**BEFORE, **EXPECTED, 'focusUnchanged': False}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=execute) as run, \
                patch('civ7.actions._VERIFICATION_TIMEOUT', 0.01):
            self.assertEqual((await actions.acknowledge_town_focus(**ARGS))['status'], 'unknown')
        self.assertEqual(sum(c.args[0] == 'acknowledge_town_focus.js' for c in run.await_args_list), 1)

    async def test_invalid_inputs_never_reach_transport_and_tool_is_strict_opt_in_mutating(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn(NAME, normal)
        self.assertIn(NAME, set(tools))
        self.assertFalse(tools[NAME].annotations.read_only_hint)
        self.assertTrue(tools[NAME].annotations.destructive_hint)
        self.assertFalse(tools[NAME].annotations.idempotent_hint)
        self.assertEqual(set(tools[NAME].parameters['required']), set(ARGS))
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for change in ({'notification_id': True}, {'component_type': -1}, {'expected_turn': True}):
                with self.assertRaises(ValueError): await actions.acknowledge_town_focus(**{**ARGS, **change})
            with self.assertRaises(ToolError): await create_server(enable_writes=True).call_tool(NAME, {**ARGS, 'notification_id': True})
            run.assert_not_awaited()
