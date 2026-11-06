import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class AirliftTests(unittest.IsolatedAsyncioTestCase):
    async def test_mass_airdrop_binds_distinct_sorted_payload_and_uses_one_native_operation(self):
        self.assertTrue(callable(getattr(actions,'airdrop_infantry_group',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.airdrop_infantry_group([11,10],30,2,1,62)
        self.assertEqual(run.await_args.args,('unit_membership.js',{'mode':'airdrop_group','unit_id':10,'payload_unit_ids':[10,11],'commander_id':30,'x':2,'y':1,'expected_turn':62,'air_transport':True}))
        for ids in ([10],[10,10],[True,11],list(range(8))):
            with self.assertRaises(ValueError):await actions.airdrop_infantry_group(ids,30,2,1,62)
        self.assertNotIn('airdrop_civ7_infantry_group',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('airdrop_civ7_infantry_group',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})

    async def test_one_infantry_airdrop_is_separate_native_commander_operation(self):
        self.assertTrue(callable(getattr(actions,'airdrop_infantry',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.airdrop_infantry(10,30,2,1,62)
        self.assertEqual(run.await_args.args,('unit_membership.js',{'mode':'airdrop','unit_id':10,'commander_id':30,'x':2,'y':1,'expected_turn':62,'air_transport':True}))
        self.assertNotIn('airdrop_civ7_infantry',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('airdrop_civ7_infantry',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})

    async def test_airlift_membership_is_separate_fixed_squadron_infantry_intent(self):
        self.assertTrue(callable(getattr(actions,'join_airlift',None)))
        self.assertTrue(callable(getattr(actions,'leave_airlift',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.join_airlift(10,30,62)
        self.assertEqual(run.await_args.args,('unit_membership.js',{'mode':'join','unit_id':10,'commander_id':30,'expected_turn':62,'air_transport':True}))
        for name in ('join_civ7_airlift','leave_civ7_airlift'):
            self.assertNotIn(name,{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn(name,{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
