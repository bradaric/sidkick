import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

CASES = [
    ('join_civ7_commander', 'join_commander', (10, 30, 62), {'mode': 'join', 'unit_id': 10, 'commander_id': 30, 'expected_turn': 62}),
    ('leave_civ7_commander', 'leave_commander', (10, 30, 2, 3, 62), {'mode': 'leave', 'unit_id': 10, 'commander_id': 30, 'x': 2, 'y': 3, 'expected_turn': 62}),
    ('join_civ7_fleet', 'join_fleet', (10, 30, 62), {'mode': 'join', 'unit_id': 10, 'commander_id': 30, 'expected_turn': 62, 'domain': 'DOMAIN_SEA'}),
    ('leave_civ7_fleet', 'leave_fleet', (10, 30, 2, 3, 62), {'mode': 'leave', 'unit_id': 10, 'commander_id': 30, 'x': 2, 'y': 3, 'expected_turn': 62, 'domain': 'DOMAIN_SEA'}),
]


class MembershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_membership_wrappers_submit_once_and_verify_captured_army_inventory(self):
        for _, fn, args, arguments in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            before = {'turn': 62, 'age': 42, 'playerId': 0}
            expected = {'unitId': 10, 'packed': fn in ('join_commander', 'join_fleet'), 'armies': []}
            captured = {**arguments, 'baseline_armies': []}
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': captured}, {**before, **expected}]) as run:
                self.assertEqual((await getattr(actions, fn)(*args))['status'], 'verified_applied')
            self.assertEqual(run.await_args_list[0].args, ('unit_membership.js', arguments))
            self.assertEqual(run.await_args_list[1].args, ('unit_membership_state.js', captured))

    async def test_membership_tools_are_strict_mutating_and_opt_in(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, fn, args, arguments in CASES:
            self.assertNotIn(name, normal); self.assertIn(name, set(enabled))
            self.assertFalse(enabled[name].annotations.read_only_hint); self.assertTrue(enabled[name].annotations.destructive_hint)
            self.assertFalse(enabled[name].annotations.idempotent_hint)
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError): await getattr(actions, fn)(True, *args[1:])
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {k: True if k == 'expected_turn' else v for k, v in arguments.items() if k not in ('mode', 'domain')})
                run.assert_not_awaited()

    async def test_membership_uncertainty_and_noops_never_retry(self):
        for _, fn, args, _ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            for status in ('rejected', 'already_active', 'already_inactive'):
                with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': status}) as run:
                    self.assertEqual((await getattr(actions, fn)(*args))['status'], status); self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
                self.assertEqual((await getattr(actions, fn)(*args))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
                with self.assertRaises(asyncio.CancelledError): await getattr(actions, fn)(*args)
                self.assertEqual(run.await_count, 1)
