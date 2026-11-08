import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class PeaceDealTests(unittest.IsolatedAsyncioTestCase):
    async def test_white_peace_actions_are_fixed_token_bound_and_opt_in(self):
        self.assertTrue(callable(getattr(actions,'peace_deal_action',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.peace_deal_action(3,'prepare',62)
        self.assertEqual(run.await_args.args,('peace_deal_action.js',{'target_player_id':3,'action':'prepare','expected_turn':62,'deal_token':None}))
        with self.assertRaises(ValueError):await actions.peace_deal_action(3,'propose',62)
        self.assertNotIn('manage_civ7_white_peace_deal',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('manage_civ7_white_peace_deal',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
