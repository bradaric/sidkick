import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class AirSweepBombTests(unittest.IsolatedAsyncioTestCase):
    async def test_sweep_and_bomb_are_fixed_separate_intents(self):
        self.assertTrue(callable(getattr(actions,'sweep_air_location',None)))
        self.assertTrue(callable(getattr(actions,'bombard_air_district',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.sweep_air_location(30,3,3,62)
        self.assertEqual(run.await_args.args,('group_air_attack.js',{'commander_id':30,'mission':'sweep','x':3,'y':3,'expected_turn':62}))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.bombard_air_district(30,1,99,3,3,62)
        self.assertEqual(run.await_args.args,('group_air_attack.js',{'commander_id':30,'mission':'bomb','target_player':1,'district_id':99,'x':3,'y':3,'expected_turn':62}))
        for name in ('sweep_civ7_air_location','bombard_civ7_air_district'):
            self.assertNotIn(name,{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn(name,{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
