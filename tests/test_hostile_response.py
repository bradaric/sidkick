import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server

class HostileResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_hostile_response_intent_keeps_exact_event_native_response_and_cap(self):
        self.assertTrue(callable(getattr(actions,'respond_hostile_diplomatic_project',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.respond_hostile_diplomatic_project(76,'reject',180.0,62)
        self.assertEqual(run.await_args.args,('respond_diplomatic_project.js',{'action_id':76,'response':'reject','max_influence_cost':180.0,'expected_turn':62,'hostile':True}))
        for cap in (True,-1,float('inf')):
            with self.assertRaises(ValueError):await actions.respond_hostile_diplomatic_project(76,'reject',cap,62)
        self.assertNotIn('respond_civ7_hostile_project',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('respond_civ7_hostile_project',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
