import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class ObservedAttackTests(unittest.IsolatedAsyncioTestCase):
    async def test_observed_field_attack_uses_same_fixed_attack_with_bounded_evidence_capture(self):
        self.assertTrue(callable(getattr(actions,'observed_field_attack',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.observed_field_attack(10,1,20,3,3,'melee',62,1)
        self.assertEqual(run.await_args.args,('attack_unit.js',{'unit_id':10,'target_player':1,'target_unit_id':20,'x':3,'y':3,'kind':'melee','expected_turn':62,'observe_effects':True,'observation_radius':1}))
        with self.assertRaises(ValueError):await actions.observed_field_attack(10,1,20,3,3,'melee',62,4)
        self.assertNotIn('observe_civ7_field_attack',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('observe_civ7_field_attack',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
