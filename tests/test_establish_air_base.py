import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class EstablishAirBaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_establishment_is_fixed_opt_in_and_separate_from_aircraft_transfer(self):
        self.assertTrue(callable(getattr(actions,'establish_air_base',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.establish_air_base(10,3,3,62)
        self.assertEqual(run.await_args.args,('commander_action.js',{'mode':'air_base','commander_id':10,'x':3,'y':3,'expected_turn':62}))
        self.assertNotIn('establish_civ7_air_base',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('establish_civ7_air_base',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
