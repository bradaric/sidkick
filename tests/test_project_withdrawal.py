import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class WithdrawalTests(unittest.IsolatedAsyncioTestCase):
    async def test_project_withdrawal_is_fixed_own_zero_penalty_opt_in(self):
        self.assertTrue(callable(getattr(actions,'withdraw_project_support',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.withdraw_project_support(80,4,62)
        self.assertEqual(run.await_args.args,('withdraw_project_support.js',{'event_id':80,'target_player_id':4,'expected_turn':62}))
        self.assertNotIn('withdraw_civ7_project_support',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('withdraw_civ7_project_support',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
