import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

CASES = [
    ('choose_civ7_government', 'choose_government', ('GOVERNMENT_TEST', 60),
     {'mode': 'government', 'selection': 'GOVERNMENT_TEST', 'expected_turn': 60},
     {'government': 'GOVERNMENT_TEST', 'governmentPending': False}),
    ('choose_civ7_celebration', 'choose_celebration', ('GOLDEN_AGE_TEST', 60),
     {'mode': 'celebration', 'selection': 'GOLDEN_AGE_TEST', 'expected_turn': 60},
     {'celebration': 'GOLDEN_AGE_TEST', 'celebrationPending': False}),
    ('review_civ7_resources', 'review_resources', (60,),
     {'mode': 'resource_review', 'expected_turn': 60}, {'resourceReviewPending': False}),
    ('review_civ7_policies', 'review_policies', (60,),
     {'mode': 'policy_review', 'expected_turn': 60}, {'policyReviewPending': False}),
]
BEFORE = {'turn': 60, 'age': 42, 'playerId': 0}


class MandatoryChoicesTests(unittest.IsolatedAsyncioTestCase):
    async def test_agenda_wrapper_and_tool_are_bounded_and_opt_in(self):
        self.assertTrue(callable(getattr(actions, 'acknowledge_agenda', None)))
        expected = {'notificationId': 288, 'componentType': 20, 'acknowledged': True}
        read_args = {'notification_id': 288, 'component_type': 20}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': BEFORE, 'expected': expected, 'verificationArguments': read_args},
            {**BEFORE, **expected}]) as run:
            result = await actions.acknowledge_agenda(288, 60)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual(run.await_args_list[0].args, ('acknowledge_agenda.js', {'notification_id': 288, 'expected_turn': 60}))
        self.assertEqual(run.await_args_list[1].args, ('agenda_state.js', read_args))
        self.assertNotIn('acknowledge_civ7_agenda', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = next(t for t in create_server(enable_writes=True)._tool_manager.list_tools() if t.name == 'acknowledge_civ7_agenda')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError):
                await actions.acknowledge_agenda(True, 60)
            run.assert_not_awaited()

    async def test_wrappers_submit_once_and_verify_selection_and_pending_state(self):
        for _, fn, positional, arguments, expected in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': BEFORE, 'expected': expected}, {**BEFORE, **expected}]) as run:
                result = await getattr(actions, fn)(*positional)
            self.assertEqual(result['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args, ('mandatory_choice.js', arguments))
            self.assertEqual(run.await_args_list[1].args, ('mandatory_choice_state.js',))

    async def test_mcp_is_opt_in_strict_and_mutating(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, _, _, _, _ in CASES:
            self.assertNotIn(name, normal)
            self.assertIn(name, set(tools))
            self.assertFalse(tools[name].annotations.read_only_hint)
            self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {'expected_turn': True})
                run.assert_not_awaited()

    async def test_invalid_inputs_rejections_and_uncertain_outcomes_never_retry(self):
        for _, fn, positional, _, _ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            malformed = (*positional[:-1], True)
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await getattr(actions, fn)(*malformed)
                run.assert_not_awaited()
            for status in ('rejected', 'already_active'):
                with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                    self.assertEqual((await getattr(actions, fn)(*positional))['status'], status)
                    self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
                with self.assertRaises(asyncio.CancelledError):
                    await getattr(actions, fn)(*positional)
                self.assertEqual(run.await_count, 1)
