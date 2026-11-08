import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class FleetAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_observed_land_group_keeps_existing_fixed_land_roles(self):
        self.assertTrue(callable(getattr(actions,'observed_army_attack',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.observed_army_attack(30,'ranged',1,20,3,3,62)
        self.assertEqual(run.await_args.args,('army_attack.js',{'commander_id':30,'attack_kind':'ranged','target_player':1,'target_unit_id':20,'x':3,'y':3,'expected_turn':62,'observe_effects':True,'observation_radius':1}))

    async def test_fleet_attacks_are_fixed_native_roles_with_bounded_group_observation(self):
        self.assertTrue(callable(getattr(actions,'fleet_attack',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.fleet_attack(30,'heavy',1,20,3,3,62)
        self.assertEqual(run.await_args.args,('army_attack.js',{'commander_id':30,'attack_kind':'sea_ranged','target_player':1,'target_unit_id':20,'x':3,'y':3,'expected_turn':62,'observe_effects':True,'observation_radius':1}))
        with self.assertRaises(ValueError):await actions.fleet_attack(30,'raw',1,20,3,3,62)
        self.assertNotIn('attack_civ7_fleet',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('attack_civ7_fleet',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
