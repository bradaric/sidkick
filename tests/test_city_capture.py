import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CityCaptureTests(unittest.IsolatedAsyncioTestCase):
    async def test_city_assault_and_decision_are_separate_fixed_opt_in_actions(self):
        self.assertTrue(callable(getattr(actions,'assault_city',None)))
        self.assertTrue(callable(getattr(actions,'resolve_city_capture',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.assault_city(10,1,40,3,3,'melee',62)
        self.assertEqual(run.await_args.args,('assault_city.js',{'unit_id':10,'target_player':1,'target_city_id':40,'x':3,'y':3,'mode':'melee','expected_turn':62}))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.resolve_city_capture(40,'keep',62)
        self.assertEqual(run.await_args.args,('resolve_city_capture.js',{'city_id':40,'choice':'keep','expected_turn':62}))
        for name in ('assault_civ7_city','resolve_civ7_city_capture'):
            self.assertNotIn(name,{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn(name,{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
