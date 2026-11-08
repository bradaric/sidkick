import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

CASES = [
    ('set_civ7_town_focus', 'set_town_focus', ('Test', 'PROJECT_TOWN_PRODUCTION', 59),
     {'mode': 'focus', 'settlement': 'Test', 'focus': 'PROJECT_TOWN_PRODUCTION', 'expected_turn': 59},
     {'cityId': 10, 'focus': 'PROJECT_TOWN_PRODUCTION'}),
    ('upgrade_civ7_town', 'upgrade_town', ('Test', 500, 59),
     {'mode': 'upgrade', 'settlement': 'Test', 'max_gold_cost': 500, 'expected_turn': 59},
     {'cityId': 10, 'isTown': False}),
    ('assign_civ7_specialist', 'assign_specialist', ('Test', 6, 1, 59),
     {'mode': 'specialist', 'settlement': 'Test', 'x': 6, 'y': 1, 'expected_turn': 59},
     {'cityId': 10, 'workerCount': 1, 'pendingPopulation': 0}),
]
BEFORE = {'turn': 59, 'age': 42, 'playerId': 0}

class SettlementManagementTests(unittest.IsolatedAsyncioTestCase):
    async def test_wrappers_submit_fixed_scripts_and_poll_captured_city_identity(self):
        for _, fn, positional, arguments, expected in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            read_args = {**arguments, 'city_id': 10}
            submitted = {'status': 'submitted', 'before': BEFORE, 'expected': expected, 'verificationArguments': read_args}
            with patch('civ7.actions.run_script', new_callable=AsyncMock,
                       side_effect=[submitted, BEFORE, {**BEFORE, **expected}]) as run, patch(
                           'civ7.actions.asyncio.sleep', new_callable=AsyncMock):
                result = await getattr(actions, fn)(*positional)
            self.assertEqual(result['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args, ('settlement_management.js', arguments))
            self.assertEqual([c.args for c in run.await_args_list[1:]], [('settlement_management_state.js', read_args)] * 2)

    async def test_mcp_registration_and_results_are_strict_mutating_and_opt_in(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, _, _, arguments, expected in CASES:
            self.assertNotIn(name, normal)
            self.assertIn(name, set(tools))
            self.assertFalse(tools[name].annotations.read_only_hint)
            self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            args = {k: v for k, v in arguments.items() if k != 'mode'}
            self.assertEqual(set(tools[name].parameters['required']), set(args))
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': BEFORE, 'expected': expected}, {**BEFORE, **expected}]):
                result = await create_server(enable_writes=True).call_tool(name, args)
            self.assertFalse(result.is_error)
            self.assertEqual(result.structured_content['status'], 'verified_applied')
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {**args, 'expected_turn': True})
                run.assert_not_awaited()

    async def test_invalid_inputs_never_reach_transport(self):
        for _, fn, positional, _, _ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            for index, value in ((0, ' '), (len(positional)-1, True), (1, True)):
                malformed = list(positional); malformed[index] = value
                with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                    with self.assertRaises(ValueError):
                        await getattr(actions, fn)(*malformed)
                    run.assert_not_awaited()

    async def test_rejections_noops_timeouts_and_cancellation_do_not_retry(self):
        for _, fn, positional, *_ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            for status in ('rejected', 'already_active'):
                with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                    self.assertEqual((await getattr(actions, fn)(*positional))['status'], status)
                    self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
                with self.assertRaises(asyncio.CancelledError): await getattr(actions, fn)(*positional)
                self.assertEqual(run.await_count, 1)
