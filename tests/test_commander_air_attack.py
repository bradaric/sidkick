import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CommanderAirAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_commander_air_mission_binds_exact_source_and_target(self):
        self.assertTrue(callable(getattr(actions,'air_attack_from_commander',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.air_attack_from_commander(10,30,1,20,3,3,62)
        self.assertEqual(run.await_args.args,('air_attack_unit.js',{'unit_id':10,'source_commander_id':30,'target_player':1,'target_unit_id':20,'x':3,'y':3,'expected_turn':62}))
        self.assertNotIn('air_attack_civ7_from_commander',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('air_attack_civ7_from_commander',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
