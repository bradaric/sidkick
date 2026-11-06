import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server
class LocalCivilianTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_activity_fixed_intents_are_strict_opt_in_and_single_submission(self):
        self.assertTrue(callable(getattr(actions,'local_civilian_action',None)))
        for kind in ('found','excavate','research','spread','great_person','resettle'):
            with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'}) as run:
                await actions.local_civilian_action(10,kind,62)
            self.assertEqual(run.await_args.args,('local_civilian_action.js',{'unit_id':10,'kind':kind,'expected_turn':62,'ability':None}))
        self.assertNotIn('perform_civ7_local_civilian_action',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('perform_civ7_local_civilian_action',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        with patch('civ7.actions.run_script',new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError):await actions.local_civilian_action(10,'raw',62)
            with self.assertRaises(ValueError):await actions.local_civilian_action(True,'found',62)
            run.assert_not_awaited()
        with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=TimeoutError) as run:
            self.assertEqual((await actions.local_civilian_action(10,'found',62))['status'],'unknown');self.assertEqual(run.await_count,1)
