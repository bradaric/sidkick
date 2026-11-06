import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class PeaceConcessionsTests(unittest.IsolatedAsyncioTestCase):
    async def test_economic_peace_is_separate_from_white_peace_and_binds_token_and_caps(self):
        self.assertTrue(callable(getattr(actions,'peace_concession',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.peace_concession(3,'add','draft',100.0,0.0,62,item_token='offer')
        self.assertEqual(run.await_args.args,('peace_concession.js',{'target_player_id':3,'action':'add','deal_token':'draft','max_gold_cost':100.0,'max_influence_cost':0.0,'expected_turn':62,'item_token':'offer','item_id':None}))
        with self.assertRaises(ValueError):await actions.peace_concession(3,'add','draft',100.0,0.0,62)
        self.assertNotIn('manage_civ7_peace_concession',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('manage_civ7_peace_concession',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
