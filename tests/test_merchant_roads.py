import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class MerchantRoadTests(unittest.IsolatedAsyncioTestCase):
    async def test_road_uses_fixed_target_city_and_opt_in_tool(self):
        self.assertTrue(callable(getattr(actions,'connect_merchant_road',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.connect_merchant_road(10,8,62)
        self.assertEqual(run.await_args.args,('connect_merchant_road.js',{'unit_id':10,'target_city_id':8,'expected_turn':62}))
        self.assertNotIn('connect_civ7_merchant_road',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('connect_civ7_merchant_road',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
