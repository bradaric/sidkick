import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CappedWithdrawalTests(unittest.IsolatedAsyncioTestCase):
    async def test_definition_penalty_acknowledgement_is_separate_from_zero_penalty_tool(self):
        self.assertTrue(callable(getattr(actions,'withdraw_capped_project_support',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.withdraw_capped_project_support(81,4,10,0,62)
        self.assertEqual(run.await_args.args,('withdraw_project_support.js',{'event_id':81,'target_player_id':4,'expected_turn':62,'extended':True,'max_cancel_penalty':10,'max_unsupport_penalty':0}))
        with self.assertRaises(ValueError):await actions.withdraw_capped_project_support(81,4,True,0,62)
        self.assertNotIn('withdraw_civ7_capped_project_support',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('withdraw_civ7_capped_project_support',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
