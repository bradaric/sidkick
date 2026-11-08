import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server

class FirstMeetTests(unittest.IsolatedAsyncioTestCase):
    async def test_inherited_relationship_uses_captured_baseline_and_never_retries_unknown_readback(self):
        before={'turn':7,'age':42,'playerId':0,'relationship':5,'historyEmpty':False}
        read_args={'target_player_id':3,'notification':{'owner':0,'id':23,'type':20},
                   'before_gold':140,'expected_influence':337,'expected_relationship':25,'before_allied':False}
        submitted={'status':'submitted','before':before,'expected':{'firstMeetApplied':True},'verificationArguments':read_args}
        args={'target_player_id':3,'greeting':'friendly','max_influence_cost':20.0,
              'notification_token':'fresh-history-bound-token','expected_turn':7}
        with patch('civ7.actions.run_script',new_callable=AsyncMock,
                   side_effect=[submitted,{**before,'relationship':25,'firstMeetApplied':True}])as run:
            result=await create_server(enable_writes=True).call_tool('respond_civ7_first_meet',args)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content['status'],'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list],
                         [('respond_first_meet.js',args),('first_meet_state.js',read_args)])
        with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[submitted,TimeoutError()])as run:
            result=await actions.respond_first_meet(3,'friendly',20.0,'fresh-history-bound-token',7)
        self.assertEqual(result['status'],'unknown')
        self.assertEqual(run.await_count,2)

    async def test_first_meet_uses_exact_notification_token_and_fixed_native_greeting_not_arbitrary_reply(self):
        self.assertTrue(callable(getattr(actions,'respond_first_meet',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.respond_first_meet(3,'friendly',20.0,'fresh-token',1)
        self.assertEqual(run.await_args.args,('respond_first_meet.js',{'target_player_id':3,'greeting':'friendly','max_influence_cost':20.0,'notification_token':'fresh-token','expected_turn':1}))
        for greeting,cap,token in [('war',20,'token'),('friendly',True,'token'),('friendly',float('inf'),'token'),('friendly',20,'')]:
            with self.assertRaises(ValueError):await actions.respond_first_meet(3,greeting,cap,token,1)
        self.assertNotIn('respond_civ7_first_meet',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('respond_civ7_first_meet',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
