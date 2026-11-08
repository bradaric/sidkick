import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CivilianDestinationsTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_adjacent_found_and_foreign_spread_are_separate_opt_in_intents(self):
        self.assertTrue(callable(getattr(actions,'found_adjacent_settlement',None)))
        self.assertTrue(callable(getattr(actions,'spread_foreign_religion',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.found_adjacent_settlement(10,4,3,62)
        self.assertEqual(run.await_args.args,('local_civilian_action.js',{'kind':'found_adjacent','unit_id':10,'x':4,'y':3,'expected_turn':62}))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.spread_foreign_religion(10,1,7,62)
        self.assertEqual(run.await_args.args,('local_civilian_action.js',{'kind':'foreign_spread','unit_id':10,'target_player':1,'target_city_id':7,'expected_turn':62}))
        for name in ('found_civ7_adjacent_settlement','spread_civ7_foreign_religion'):
            self.assertNotIn(name,{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn(name,{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
