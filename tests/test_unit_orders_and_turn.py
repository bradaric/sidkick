import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server

BEFORE={'turn':59,'age':42,'playerId':0}
class UnitOrdersAndTurnTests(unittest.IsolatedAsyncioTestCase):
 async def test_unit_order_uses_shared_targeted_verifier(self):
  self.assertTrue(callable(getattr(actions,'set_unit_order',None)))
  expected={'unitId':20,'order':'sleep','orderActive':True}
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[
   {'status':'submitted','before':BEFORE,'expected':expected,'verificationArguments':{'unit_id':20,'order':'sleep'}},
   {**BEFORE,**expected}])as run:
   result=await actions.set_unit_order(20,'sleep',59)
  self.assertEqual(result['status'],'verified_applied')
  self.assertEqual(run.await_args_list[0].args,('unit_order.js',{'unit_id':20,'order':'sleep','expected_turn':59}))
  self.assertEqual(run.await_args_list[1].args,('unit_order_state.js',{'unit_id':20,'order':'sleep'}))

 async def test_end_turn_waits_for_next_active_turn_and_does_not_resubmit(self):
  self.assertTrue(callable(getattr(actions,'end_turn',None)))
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[{'status':'submitted','before':BEFORE},
   {**BEFORE,'active':False,'sent':True}, {'turn':60,'age':42,'playerId':0,'active':True,'sent':False}])as run,patch(
   'civ7.actions.asyncio.sleep',new_callable=AsyncMock):
   result=await actions.end_turn(59)
  self.assertEqual(result['status'],'verified_applied')
  self.assertEqual([c.args[0]for c in run.await_args_list],['end_turn.js','turn_state.js','turn_state.js'])

 async def test_turn_boundaries_and_uncertain_submission_are_never_retried(self):
  self.assertTrue(callable(getattr(actions,'end_turn',None)))
  for after in [{'turn':60,'age':99,'playerId':0,'active':True,'sent':False},
                {'turn':61,'age':42,'playerId':0,'active':True,'sent':False},
                {'turn':60,'age':42,'playerId':1,'active':True,'sent':False}]:
   with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[{'status':'submitted','before':BEFORE},after])as run:
    self.assertEqual((await actions.end_turn(59))['status'],'unknown');self.assertEqual(run.await_count,2)
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=TimeoutError)as run:
   self.assertEqual((await actions.end_turn(59))['status'],'unknown');self.assertEqual(run.await_count,1)
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=asyncio.CancelledError)as run:
   with self.assertRaises(asyncio.CancelledError):await actions.end_turn(59)
   self.assertEqual(run.await_count,1)

 async def test_order_and_turn_tools_are_strict_opt_in_and_mutating(self):
  normal={t.name for t in create_server()._tool_manager.list_tools()}
  tools={t.name:t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
  for name in ('set_civ7_unit_order','end_civ7_turn'):
   self.assertNotIn(name,normal);self.assertIn(name,set(tools));self.assertFalse(tools[name].annotations.read_only_hint)
   self.assertTrue(tools[name].annotations.destructive_hint);self.assertFalse(tools[name].annotations.idempotent_hint)
  with patch('civ7.actions.run_script',new_callable=AsyncMock)as run:
   for args in [(True,'sleep',59),(20,'attack',59),(20,'sleep',True)]:
    with self.assertRaises(ValueError):await actions.set_unit_order(*args)
   with self.assertRaises(ValueError):await actions.end_turn(True)
   run.assert_not_awaited()

 async def test_mcp_rejects_malformed_arguments_before_transport(self):
  server = create_server(enable_writes=True)
  with patch('civ7.actions.run_script',new_callable=AsyncMock)as run:
   for name,args in [('end_civ7_turn',{'expected_turn':True}),('end_civ7_turn',{}),
    ('set_civ7_unit_order',{'unit_id':20,'order':'attack','expected_turn':59}),
    ('set_civ7_unit_order',{'unit_id':True,'order':'sleep','expected_turn':59})]:
    with self.assertRaises(ToolError):await server.call_tool(name,args)
   run.assert_not_awaited()

 async def test_waiting_next_turn_timeout_is_bounded_and_poll_cancellation_propagates(self):
  self.assertTrue(callable(getattr(actions,'end_turn',None)))
  submitted={'status':'submitted','before':BEFORE}
  after={'turn':60,'age':42,'playerId':0,'active':False,'sent':False}
  async def pending(script,*args):return submitted if script=='end_turn.js'else after
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=pending)as run,patch('civ7.actions._TURN_VERIFICATION_TIMEOUT',0.01):
   result=await actions.end_turn(59)
  self.assertEqual(result['status'],'unknown');self.assertEqual(result['after'],after)
  self.assertEqual(sum(c.args[0]=='end_turn.js'for c in run.await_args_list),1)
  with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[submitted,asyncio.CancelledError])as run:
   with self.assertRaises(asyncio.CancelledError):await actions.end_turn(59)
   self.assertEqual(run.await_count,2)
