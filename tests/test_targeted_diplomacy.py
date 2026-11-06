import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class TargetedDiplomacyTests(unittest.IsolatedAsyncioTestCase):
    async def test_modern_hostile_settlement_aliases_keep_exact_visible_owner_qualified_city_guards(self):
        for alias,action in [('sabotage_shipping','DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SHIPPING'),('ideological_revolt','DIPLOMACY_ACTION_ESPIONAGE_IDEOLOGICAL_REVOLT')]:
            with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
                await actions.start_targeted_diplomacy(3,alias,55,60.0,62,secondary_owner=3,x=3,y=3)
            self.assertEqual(run.await_args.args[1]['action'],action);self.assertEqual(run.await_args.args[1]['target_kind'],'targeted-major')
            with self.assertRaises(ValueError):await actions.start_targeted_diplomacy(3,alias,55,60.0,62)

    async def test_targeted_actions_are_fixed_aliases_with_explicit_secondary_identity_and_caps(self):
        self.assertTrue(callable(getattr(actions,'start_targeted_diplomacy',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.start_targeted_diplomacy(3,'hinder_food',55,60.0,62,secondary_owner=3,x=3,y=3)
        self.assertEqual(run.await_args.args,('start_diplomatic_project.js',{'target_kind':'targeted-major','target_player_id':3,'action':'DIPLOMACY_ACTION_SABOTAGE_FOOD_PRODUCTION','secondary_value':55,'max_influence_cost':60.0,'expected_turn':62,'max_gold_cost':0.0,'secondary_owner':3,'x':3,'y':3}))
        with self.assertRaises(ValueError):await actions.start_targeted_diplomacy(3,'hinder_food',55,60.0,62)
        with self.assertRaises(ValueError):await actions.start_targeted_diplomacy(3,'raw',55,60.0,62)
        self.assertNotIn('start_civ7_targeted_diplomacy',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('start_civ7_targeted_diplomacy',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
