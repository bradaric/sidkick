import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class TradePlunderTests(unittest.IsolatedAsyncioTestCase):
    async def test_trade_plunder_is_a_separate_fixed_opt_in_command(self):
        self.assertTrue(callable(getattr(actions,'plunder_trade_route',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.plunder_trade_route(10,62)
        self.assertEqual(run.await_args.args,('plunder_trade_route.js',{'unit_id':10,'expected_turn':62}))
        self.assertNotIn('plunder_civ7_trade_route',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('plunder_civ7_trade_route',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
