import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions,queries
from sidkick.server import create_server
class PeaceCityTests(unittest.IsolatedAsyncioTestCase):
    async def test_city_peace_has_exact_targeted_reader_and_separate_opt_in_action(self):
        self.assertTrue(callable(getattr(actions,'peace_city_action',None)))
        self.assertTrue(callable(getattr(queries,'peace_city_offer',None)))
        with patch('civ7.queries.run_script',new_callable=AsyncMock,return_value={})as run:
            await queries.peace_city_offer(3,0,7,2,3)
        self.assertEqual(run.await_args.args,('peace_city_offer.js',{'target_player_id':3,'city_owner':0,'city_id':7,'x':2,'y':3}))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.peace_city_action(3,0,7,2,3,'add','draft',0.0,0.0,62,item_token='offer')
        self.assertEqual(run.await_args.args,('peace_city_action.js',{'target_player_id':3,'city_owner':0,'city_id':7,'x':2,'y':3,'action':'add','deal_token':'draft','max_gold_cost':0.0,'max_influence_cost':0.0,'expected_turn':62,'item_token':'offer','item_id':None}))
        self.assertNotIn('manage_civ7_city_peace_deal',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('manage_civ7_city_peace_deal',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        self.assertIn('get_civ7_peace_city_offer',{t.name for t in create_server()._tool_manager.list_tools()})
