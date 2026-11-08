import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class UnitTravelTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_travel_does_not_relax_default_step_or_foreign_intent(self):
        self.assertTrue(callable(getattr(actions,'travel_unit',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.travel_unit(20,11,15,59,2,4)
        self.assertEqual(run.await_args.args,('move_unit.js',{'unit_id':20,'x':11,'y':15,'expected_turn':59,'mode':'travel','max_steps':2,'peaceful_player_id':4}))
        for cap in (True,0,9):
            with self.assertRaises(ValueError):await actions.travel_unit(20,11,15,59,cap)
        self.assertNotIn('travel_civ7_unit',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('travel_civ7_unit',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
