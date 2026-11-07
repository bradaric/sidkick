import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


NAME = 'acknowledge_civ7_advisor_warning'
ARGS = {'notification_id': 288, 'component_type': 20, 'expected_turn': 60}
BEFORE = {'turn': 60, 'age': 42, 'playerId': 0}
EXPECTED = {'notificationId': 288, 'componentType': 20, 'notificationType': 'NOTIFICATION_ADVISOR_WARNING_MILITARY', 'acknowledged': True}
READ_ARGS = {'notification_id': 288, 'component_type': 20, 'notification_type': EXPECTED['notificationType']}
SUBMITTED = {'status': 'submitted', 'before': BEFORE, 'expected': EXPECTED, 'verificationArguments': READ_ARGS}


class AdvisorWarningTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_submission_is_followed_only_by_targeted_readbacks(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock,
                   side_effect=[SUBMITTED, {**BEFORE, **EXPECTED, 'acknowledged': False}, {**BEFORE, **EXPECTED}]) as run, \
                patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.acknowledge_advisor_warning(288, 20, 60)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list],
                         [('acknowledge_advisor_warning.js', ARGS), ('advisor_warning_state.js', READ_ARGS),
                          ('advisor_warning_state.js', READ_ARGS)])

    async def test_rejection_uncertainty_and_cancellation_never_resubmit(self):
        for status in ['rejected', 'already_active']:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                self.assertEqual((await actions.acknowledge_advisor_warning(288, 20, 60))['status'], status)
                self.assertEqual(run.await_count, 1)
        for effects, count in [([TimeoutError()], 1), ([SUBMITTED, TimeoutError()], 2),
                               ([SUBMITTED, {**BEFORE, **EXPECTED, 'turn': 61}], 2)]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=effects) as run:
                self.assertEqual((await actions.acknowledge_advisor_warning(288, 20, 60))['status'], 'unknown')
                self.assertEqual(run.await_count, count)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[SUBMITTED, asyncio.CancelledError()]) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.acknowledge_advisor_warning(288, 20, 60)
            self.assertEqual(run.await_count, 2)

    async def test_invalid_inputs_do_not_reach_transport(self):
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 20, 60), (288, True, 60), (288, 20, True), (-1, 20, 60),
                         (288, -1, 60), (288, 20, -1), ('288', 20, 60)]:
                with self.assertRaises(ValueError):
                    await actions.acknowledge_advisor_warning(*args)
            run.assert_not_awaited()

    async def test_mcp_registration_is_opt_in_strict_and_mutating(self):
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        enabled = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn(NAME, normal)
        tool = enabled[NAME]
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters['required']), set(ARGS))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[SUBMITTED, {**BEFORE, **EXPECTED}]):
            result = await create_server(enable_writes=True).call_tool(NAME, ARGS)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool(NAME, {**ARGS, 'component_type': True})
            run.assert_not_awaited()
