import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class WarSupportTests(unittest.IsolatedAsyncioTestCase):
    async def test_own_war_support_is_separate_opt_in_runtime_capped_intent(self):
        self.assertTrue(callable(getattr(actions,'support_own_war',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.support_own_war(78,4,180.0,62)
        self.assertEqual(run.await_args.args,('support_war.js',{'event_id':78,'target_player_id':4,'max_influence_cost':180.0,'expected_turn':62}))
        for cap in (True,-1,float('inf')):
            with self.assertRaises(ValueError):await actions.support_own_war(78,4,cap,62)
        self.assertNotIn('support_civ7_own_war',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('support_civ7_own_war',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
