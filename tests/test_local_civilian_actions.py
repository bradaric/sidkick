import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server
class LocalCivilianTests(unittest.IsolatedAsyncioTestCase):
    async def test_founding_tools_explicitly_distinguish_current_and_adjacent_tile_paths(self):
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        local = tools['perform_civ7_local_civilian_action']
        adjacent = tools['found_civ7_adjacent_settlement']
        movement = tools['get_civ7_movement_and_founding']
        self.assertIn('kind=found', local.description)
        self.assertIn('under the Settler', local.description)
        self.assertIn('perform_civ7_local_civilian_action', adjacent.description)
        self.assertIn('kind=found', adjacent.description)
        self.assertIn('founding.availableNow', movement.description)
        self.assertIn('perform_civ7_local_civilian_action', movement.description)
        self.assertEqual(set(local.parameters['required']), {'unit_id', 'kind', 'expected_turn'})
        self.assertNotIn('x', local.parameters['properties'])
        self.assertNotIn('y', local.parameters['properties'])

    async def test_mcp_current_tile_founding_dispatches_and_verifies_without_coordinates_or_movement(self):
        args = {'unit_id': 10, 'kind': 'found', 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        verification = {'unit_id': 10, 'kind': 'found'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': {'unitId': 10, 'activityObserved': True},
             'verificationArguments': verification}, {**before, 'unitId': 10, 'activityObserved': True}]) as run:
            result = await create_server(enable_writes=True).call_tool('perform_civ7_local_civilian_action', args)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list], [
            ('local_civilian_action.js', {**args, 'ability': None}), ('local_civilian_state.js', verification)])

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
