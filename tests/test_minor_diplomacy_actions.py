import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server

class MinorDiplomacyTests(unittest.IsolatedAsyncioTestCase):
    async def test_befriending_and_city_state_bonus_are_fixed_strict_opt_in_actions(self):
        self.assertTrue(callable(getattr(actions, 'befriend_independent', None)))
        self.assertTrue(callable(getattr(actions, 'choose_city_state_bonus', None)))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await actions.befriend_independent(3, 150.0, 62)
        self.assertEqual(run.await_args.args, ('start_diplomatic_project.js', {'target_kind': 'independent', 'target_player_id': 3,
            'action': 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', 'max_influence_cost': 150.0, 'expected_turn': 62}))
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await actions.choose_city_state_bonus(3, 'BONUS_TEST', 62)
        self.assertEqual(run.await_args.args, ('choose_city_state_bonus.js', {'city_state_id': 3, 'bonus': 'BONUS_TEST', 'expected_turn': 62}))
        default = {t.name for t in create_server()._tool_manager.list_tools()}; enabled = {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name in ('befriend_civ7_independent', 'choose_civ7_city_state_bonus'): self.assertNotIn(name, default); self.assertIn(name, enabled)
