import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class CallToArmsTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_diplomacy_tool_returns_call_to_arms_without_enabling_writes(self):
        server = create_server()
        tool = next(tool for tool in server._tool_manager.list_tools() if tool.name == 'get_civ7_diplomacy')
        self.assertTrue(tool.annotations.read_only_hint)
        self.assertFalse(tool.annotations.destructive_hint)
        data = {'turn': 37, 'majorPlayers': [], 'callToArms': [{
            'notification': {'owner': 0, 'id': 294, 'type': 20}, 'warEventId': 39, 'status': 'pending',
            'responseOptions': [{'response': 'pay_influence', 'quotedInfluenceCost': 240,
                                 'availableNow': True, 'supportedByWriteTool': True,
                                 'responseTool': 'pay_civ7_call_to_arms', 'paymentToken': 'fresh-token'}],
        }]}
        with patch('civ7.queries.run_script', new_callable=AsyncMock, return_value=data) as run:
            result = await server.call_tool('get_civ7_diplomacy', {})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, data)
        run.assert_awaited_once_with('diplomacy.js')

    async def test_payment_is_strict_opt_in_and_verifies_once_without_resubmitting(self):
        self.assertTrue(callable(getattr(actions, 'pay_call_to_arms', None)))
        default = {tool.name for tool in create_server()._tool_manager.list_tools()}
        self.assertNotIn('pay_civ7_call_to_arms', default)
        server = create_server(enable_writes=True)
        tool = next(tool for tool in server._tool_manager.list_tools() if tool.name == 'pay_civ7_call_to_arms')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        args = {'war_event_id': 39, 'ally_player_id': 4, 'opponent_player_id': 5, 'payment_token': 'fresh-token',
                'max_influence_cost': 240, 'expected_turn': 37}
        self.assertEqual(set(tool.parameters['required']), set(args))
        before = {'turn': 37, 'age': 42, 'playerId': 0}
        verification = {'war_event_id': 39, 'expected_influence': 260}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'callToArmsPaymentApplied': True},
             'verificationArguments': verification}, {**before, 'callToArmsPaymentApplied': True}]) as run:
            result = await server.call_tool('pay_civ7_call_to_arms', args)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list],
                         [('pay_call_to_arms.js', args), ('call_to_arms_payment_state.js', verification)])
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'callToArmsPaymentApplied': True},
             'verificationArguments': verification}, TimeoutError]) as run:
            self.assertEqual((await actions.pay_call_to_arms(**args))['status'], 'unknown')
            self.assertEqual([call.args[0] for call in run.await_args_list], ['pay_call_to_arms.js', 'call_to_arms_payment_state.js'])
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.pay_call_to_arms(**args))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.pay_call_to_arms(**args)
            self.assertEqual(run.await_count, 1)

    async def test_payment_rejects_malformed_selectors_costs_and_missing_tokens_before_transport(self):
        self.assertTrue(callable(getattr(actions, 'pay_call_to_arms', None)))
        args = {'war_event_id': 39, 'ally_player_id': 4, 'opponent_player_id': 5, 'payment_token': 'fresh-token',
                'max_influence_cost': 240, 'expected_turn': 37}
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for change in [{'war_event_id': True}, {'max_influence_cost': True}, {'max_influence_cost': float('nan')},
                           {'max_influence_cost': -1}, {'payment_token': ''}, {'expected_turn': -1},
                           {'opponent_player_id': 4}]:
                with self.assertRaises(ValueError):
                    await actions.pay_call_to_arms(**{**args, **change})
            for change in [{'war_event_id': True}, {'max_influence_cost': True}, {'payment_token': None}]:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool('pay_civ7_call_to_arms', {**args, **change})
            run.assert_not_awaited()
