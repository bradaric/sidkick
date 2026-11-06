import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class ExtendedNarrativeTests(unittest.IsolatedAsyncioTestCase):
    async def test_extended_choices_bind_trial_acknowledgement_and_known_currency_cap(self):
        self.assertTrue(callable(getattr(actions,'choose_extended_narrative',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.choose_extended_narrative(15,30,'CHOICE',62,60.0,'YIELD_GOLD',True)
        self.assertEqual(run.await_args.args,('choose_narrative.js',{'instance_id':15,'instance_type':30,'choice':'CHOICE','expected_turn':62,'extended':True,'max_cost':60.0,'cost_yield':'YIELD_GOLD','allow_trial':True}))
        with self.assertRaises(ValueError):await actions.choose_extended_narrative(15,30,'CHOICE',62,True)
        self.assertNotIn('choose_civ7_extended_narrative',{t.name for t in create_server()._tool_manager.list_tools()});self.assertIn('choose_civ7_extended_narrative',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
