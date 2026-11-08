import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class GroupAirAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_group_air_mission_is_explicit_opt_in_and_fixed_native_family(self):
        self.assertTrue(callable(getattr(actions,'group_air_attack',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.group_air_attack(30,'land',1,20,3,3,62)
        self.assertEqual(run.await_args.args,('group_air_attack.js',{'commander_id':30,'mission':'land','target_player':1,'target_unit_id':20,'x':3,'y':3,'expected_turn':62}))
        with self.assertRaises(ValueError):await actions.group_air_attack(30,'raw',1,20,3,3,62)
        self.assertNotIn('group_civ7_air_attack',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('group_civ7_air_attack',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
