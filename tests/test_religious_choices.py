import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server

class ReligiousChoiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_fixed_religious_actions_are_opt_in_strict_and_never_retried(self):
        self.assertTrue(callable(getattr(actions, 'choose_religious_action', None)))
        for kind in ('pantheon', 'belief', 'found'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                await actions.choose_religious_action(kind, 'EXACT_ID', 62)
            self.assertEqual(run.await_args.args, ('religious_choice.js', {'kind': kind, 'choice': 'EXACT_ID', 'expected_turn': 62}))
        self.assertNotIn('choose_civ7_religious_action', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('choose_civ7_religious_action', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.choose_religious_action('raw', 'X', 62)
            with self.assertRaises(ValueError): await actions.choose_religious_action('belief', 'X', True)
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.choose_religious_action('belief', 'X', 62))['status'], 'unknown'); self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError): await actions.choose_religious_action('belief', 'X', 62)
            self.assertEqual(run.await_count, 1)
