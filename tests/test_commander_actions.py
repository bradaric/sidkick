import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

CASES = [
    ('pack_civ7_commander', 'pack_commander', (10, 62), {'mode': 'pack', 'commander_id': 10, 'expected_turn': 62}, 'packObserved'),
    ('unpack_civ7_commander', 'unpack_commander', (10, 2, 3, 62), {'mode': 'unpack', 'commander_id': 10, 'x': 2, 'y': 3, 'expected_turn': 62}, 'unpackObserved'),
    ('move_civ7_commander', 'move_commander', (10, 2, 3, 62), {'mode': 'move', 'commander_id': 10, 'x': 2, 'y': 3, 'expected_turn': 62, 'max_steps': 1}, 'moveObserved'),
]


class CommanderActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_commander_wrappers_use_single_submission_and_captured_membership_verification(self):
        for _, fn, positional, arguments, field in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            before = {'turn': 62, 'age': 42, 'playerId': 0}
            expected = {'commanderId': 10, field: True}
            read_args = {**arguments, 'baseline_packed_unit_ids': [20], 'baseline_unit_ids': [10, 20]}
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': read_args}, {**before, **expected}]) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args, ('commander_action.js', arguments))
            self.assertEqual(run.await_args_list[1].args, ('commander_action_state.js', read_args))

    async def test_commander_tools_are_strict_mutating_and_opt_in(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, fn, positional, arguments, _ in CASES:
            self.assertNotIn(name, normal); self.assertIn(name, tools)
            self.assertFalse(tools[name].annotations.read_only_hint); self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            bad = (True, *positional[1:])
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError): await getattr(actions, fn)(*bad)
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {k: True if k == 'expected_turn' else v for k, v in arguments.items() if k != 'mode'})
                run.assert_not_awaited()

    async def test_commander_rejections_and_uncertain_outcomes_never_retry(self):
        for _, fn, positional, *_ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))['status'], 'rejected'); self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
                with self.assertRaises(asyncio.CancelledError): await getattr(actions, fn)(*positional)
                self.assertEqual(run.await_count, 1)
