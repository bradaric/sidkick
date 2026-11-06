import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server

class FirstMeetTests(unittest.IsolatedAsyncioTestCase):
    async def test_first_meet_uses_exact_notification_token_and_fixed_native_greeting_not_arbitrary_reply(self):
        self.assertTrue(callable(getattr(actions,'respond_first_meet',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.respond_first_meet(3,'friendly',20.0,'fresh-token',1)
        self.assertEqual(run.await_args.args,('respond_first_meet.js',{'target_player_id':3,'greeting':'friendly','max_influence_cost':20.0,'notification_token':'fresh-token','expected_turn':1}))
        for greeting,cap,token in [('war',20,'token'),('friendly',True,'token'),('friendly',float('inf'),'token'),('friendly',20,'')]:
            with self.assertRaises(ValueError):await actions.respond_first_meet(3,greeting,cap,token,1)
        self.assertNotIn('respond_civ7_first_meet',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('respond_civ7_first_meet',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
