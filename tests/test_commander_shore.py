import unittest
from unittest.mock import AsyncMock,patch
from civ7 import actions
from sidkick.server import create_server
class CommanderShoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_river_readback_accepts_observed_embarkation_not_an_inferred_water_flag(self):
        before={'turn':11,'age':42,'playerId':0}
        expected={'commanderId':10,'location':{'x':26,'y':20},'packedUnitIds':[20],
                  'queueSize':0,'embarkationObserved':True}
        read_args={'mode':'shore','commander_id':10,'component_type':26,
                   'baseline_packed_unit_ids':[20],'baseline_unit_ids':[10,20]}
        submitted={'status':'submitted','before':before,'expected':expected,'verificationArguments':read_args}
        for embarked in (False,True):
            with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[submitted,
                       {**before,**expected,'embarked':embarked}])as run:
                result=await actions.cross_commander_shore(10,26,20,11)
            self.assertEqual(result['status'],'verified_applied')
            self.assertEqual(result['after']['embarked'],embarked)
            self.assertEqual([call.args[0]for call in run.await_args_list],['commander_action.js','commander_action_state.js'])
        with patch('civ7.actions.run_script',new_callable=AsyncMock,side_effect=[submitted,TimeoutError()])as run:
            self.assertEqual((await actions.cross_commander_shore(10,26,20,11))['status'],'unknown')
            self.assertEqual(run.await_count,2)

    async def test_packed_shore_is_separate_fixed_opt_in_movement(self):
        self.assertTrue(callable(getattr(actions,'cross_commander_shore',None)))
        with patch('civ7.actions.run_script',new_callable=AsyncMock,return_value={'status':'rejected'})as run:
            await actions.cross_commander_shore(10,3,3,62)
        self.assertEqual(run.await_args.args,('commander_action.js',{'commander_id':10,'x':3,'y':3,'expected_turn':62,'mode':'shore'}))
        self.assertNotIn('cross_civ7_commander_shore',{t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('cross_civ7_commander_shore',{t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
