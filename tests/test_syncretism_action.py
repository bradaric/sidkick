import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


class SyncretismActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_opt_in_single_submission_and_read_only_verification(self):
        self.assertTrue(callable(getattr(actions, 'choose_syncretism', None)))
        name = 'choose_civ7_syncretism'
        self.assertNotIn(name, {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn(name, enabled)
        self.assertFalse(enabled[name].annotations.read_only_hint)
        self.assertTrue(enabled[name].annotations.destructive_hint)
        self.assertFalse(enabled[name].annotations.idempotent_hint)
        before = {'turn': 68, 'age': -300, 'playerId': 0}
        submitted = {'status': 'submitted', 'before': before, 'expected': {'syncretismObserved': True},
                     'verificationArguments': {'choice_id': -123}}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[submitted,
            {**before, 'syncretismObserved': False}, {**before, 'syncretismObserved': True}]) as run, \
                patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.choose_syncretism('self', -123, 68)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([c.args[0] for c in run.await_args_list], ['choose_syncretism.js', 'syncretism_state.js', 'syncretism_state.js'])
        self.assertEqual(run.await_args_list[0].args[1], {'kind': 'self', 'choice_id': -123, 'expected_turn': 68, 'confirm_unit_replacements': False})

    async def test_invalid_input_never_reaches_transport_and_explicit_replacement_acknowledgement_is_passed(self):
        self.assertTrue(callable(getattr(actions, 'choose_syncretism', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            for args in [('other', -123, 68), ('self', True, 68), ('self', -1, 68), ('self', -123, True),
                         ('self', -123, -1), ('self', 2**40, 68), ('units', -123, 68, 1)]:
                with self.assertRaises(ValueError): await actions.choose_syncretism(*args)
            run.assert_not_awaited()
            await actions.choose_syncretism('units', -123, 68, True)
            self.assertTrue(run.await_args.args[1]['confirm_unit_replacements'])

    async def test_mcp_rejects_coercion_of_signed_choice_id_turn_or_replacement_acknowledgement(self):
        server = create_server(enable_writes=True)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for invalid in ({'choice_id': True}, {'choice_id': '-123'}, {'expected_turn': True},
                            {'confirm_unit_replacements': 'true'}, {'confirm_unit_replacements': 1}):
                with self.assertRaises(ToolError):
                    await server.call_tool('choose_civ7_syncretism', {'kind': 'self', 'choice_id': -123, 'expected_turn': 68, **invalid})
            run.assert_not_awaited()

    async def test_unknown_cancelled_or_changed_context_never_resubmits(self):
        self.assertTrue(callable(getattr(actions, 'choose_syncretism', None)))
        before = {'turn': 68, 'age': -300, 'playerId': 0}
        submitted = {'status': 'submitted', 'before': before, 'expected': {'syncretismObserved': True},
                     'verificationArguments': {}}
        for effects in ([TimeoutError], [submitted, TimeoutError], [submitted, {**before, 'turn': 69}]):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=effects) as run:
                self.assertEqual((await actions.choose_syncretism('self', -123, 68))['status'], 'unknown')
                self.assertEqual(run.await_count, len(effects))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[submitted, asyncio.CancelledError]) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.choose_syncretism('self', -123, 68)
            self.assertEqual(run.await_count, 2)
