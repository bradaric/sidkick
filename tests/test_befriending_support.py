import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import actions
from sidkick.server import create_server


class BefriendingSupportTests(unittest.IsolatedAsyncioTestCase):
    async def test_opt_in_single_submission_and_read_only_verification(self):
        self.assertTrue(callable(getattr(actions, 'support_befriending', None)))
        name = 'support_civ7_befriending'
        self.assertNotIn(name, {t.name for t in create_server()._tool_manager.list_tools()})
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn(name, enabled)
        self.assertFalse(enabled[name].annotations.read_only_hint)
        self.assertFalse(enabled[name].annotations.idempotent_hint)
        before = {'turn': 64, 'age': -123, 'playerId': 0}
        submitted = {'status': 'submitted', 'before': before, 'expected': {'befriendingSupportApplied': True},
                     'verificationArguments': {'event_id': 62}}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[submitted,
            {**before, 'befriendingSupportApplied': False}, {**before, 'befriendingSupportApplied': True}]) as run, \
                patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.support_befriending(62, 7, 360.0, 64)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([c.args[0] for c in run.await_args_list],
                         ['support_befriending.js', 'befriending_support_state.js', 'befriending_support_state.js'])
        self.assertEqual(run.await_args_list[0].args[1],
                         {'event_id': 62, 'target_player_id': 7, 'max_influence_cost': 360.0, 'expected_turn': 64})

    async def test_invalid_values_never_reach_transport(self):
        self.assertTrue(callable(getattr(actions, 'support_befriending', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            for args in [(True, 7, 360, 64), (62, -1, 360, 64), (62, 7, True, 64),
                         (62, 7, -1, 64), (62, 7, float('inf'), 64), (62, 7, float('nan'), 64), (62, 7, 360, True)]:
                with self.assertRaises(ValueError): await actions.support_befriending(*args)
            run.assert_not_awaited()

    async def test_unknown_cancelled_and_changed_context_never_resubmit(self):
        self.assertTrue(callable(getattr(actions, 'support_befriending', None)))
        before = {'turn': 64, 'age': -123, 'playerId': 0}
        submitted = {'status': 'submitted', 'before': before, 'expected': {'befriendingSupportApplied': True},
                     'verificationArguments': {'event_id': 62}}
        for effects in ([TimeoutError], [submitted, TimeoutError], [submitted, {**before, 'turn': 65}]):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=effects) as run:
                self.assertEqual((await actions.support_befriending(62, 7, 360.0, 64))['status'], 'unknown')
                self.assertEqual(run.await_count, len(effects))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.support_befriending(62, 7, 360.0, 64)
            self.assertEqual(run.await_count, 1)
