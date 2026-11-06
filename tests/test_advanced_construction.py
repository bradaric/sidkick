import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server

class AdvancedConstructionTests(unittest.IsolatedAsyncioTestCase):
    async def test_intents_use_strict_opt_in_native_append_with_captured_tile(self):
        self.assertTrue(callable(getattr(actions, 'append_advanced_construction', None)))
        for intent in ('wonder', 'repair', 'overbuild', 'improvement'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                await actions.append_advanced_construction('Home', 'CONSTRUCTIBLE_TEST', intent, 3, 3, '[]', 62)
            self.assertEqual(run.await_args.args, ('advanced_construction.js', {'settlement': 'Home', 'item': 'CONSTRUCTIBLE_TEST', 'construction_intent': intent,
                'x': 3, 'y': 3, 'target_token': '[]', 'expected_turn': 62, 'replace_improvement': False}))
        self.assertNotIn('append_civ7_advanced_construction', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('append_civ7_advanced_construction', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.append_advanced_construction('Home', 'X', 'raw', 3, 3, '[]', 62)
            with self.assertRaises(ValueError): await actions.append_advanced_construction('Home', 'X', 'wonder', True, 3, '[]', 62)
            run.assert_not_awaited()
