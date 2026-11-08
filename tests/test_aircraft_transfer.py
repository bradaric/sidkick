import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class AircraftTransferTests(unittest.IsolatedAsyncioTestCase):
    async def test_transfer_uses_exact_commander_target_and_separate_opt_in_tool(self):
        self.assertTrue(callable(getattr(actions,'transfer_aircraft',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.transfer_aircraft(10,30,62)
        self.assertEqual(run.await_args.args,('rebase_unit.js',{'unit_id':10,'target_commander_id':30,'expected_turn':62}))
        with self.assertRaises(ValueError):await actions.transfer_aircraft(10,10,62)
        self.assertNotIn('transfer_civ7_aircraft',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('transfer_civ7_aircraft',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
