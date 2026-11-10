import asyncio
import unittest
from unittest.mock import AsyncMock, patch
from civ7 import actions
from sidkick.server import create_server

class AdvancedConstructionTests(unittest.IsolatedAsyncioTestCase):
    async def test_repair_purchase_registration_and_verified_readback(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn('purchase_civ7_repair', normal)
        self.assertIn('purchase_civ7_repair', set(enabled))
        tool = enabled['purchase_civ7_repair']
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters['required']), {
            'settlement', 'item', 'x', 'y', 'target_token', 'max_gold_cost', 'expected_turn'})
        args = {'settlement': 'Home', 'item': 'BUILDING_TEST', 'x': 3, 'y': 3,
                'target_token': '[]', 'max_gold_cost': 428, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        expected = {'cityId': 7, 'item': 'BUILDING_TEST', 'repairObserved': True}
        verification = {'mode': 'purchase', 'construction_intent': 'repair', 'city_id': 7}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': verification},
            {**before, **expected, 'repairObserved': False}, {**before, **expected}]) as run:
            result = await create_server(enable_writes=True).call_tool('purchase_civ7_repair', args)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list], [
            ('advanced_construction.js', {**args, 'mode': 'purchase', 'construction_intent': 'repair'}),
            ('city_construction_state.js', verification), ('city_construction_state.js', verification)])

    async def test_repair_purchase_strict_validation_and_no_resubmission(self):
        self.assertTrue(callable(getattr(actions, 'purchase_repair', None)))
        args = {'settlement': 'Home', 'item': 'BUILDING_TEST', 'x': 3, 'y': 3,
                'target_token': '[]', 'max_gold_cost': 428, 'expected_turn': 62}
        for changed in [{'x': True}, {'y': -1}, {'expected_turn': True}, {'settlement': ''},
                        {'item': ''}, {'target_token': ''}, {'target_token': 'x' * 100001},
                        {'max_gold_cost': True}, {'max_gold_cost': -1}, {'max_gold_cost': float('inf')},
                        {'max_gold_cost': float('nan')}]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await actions.purchase_repair(**{**args, **changed})
                run.assert_not_awaited()
        for error in [TimeoutError, asyncio.CancelledError]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.purchase_repair(**args)
                else:
                    self.assertEqual((await actions.purchase_repair(**args))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)

    async def test_unverified_repair_readback_never_resubmits(self):
        args = {'settlement': 'Home', 'item': 'BUILDING_TEST', 'x': 3, 'y': 3,
                'target_token': '[]', 'max_gold_cost': 428, 'expected_turn': 62}
        before = {'turn': 62, 'age': 42, 'playerId': 0}
        submitted = {'status': 'submitted', 'before': before, 'expected': {'repairObserved': True},
                     'verificationArguments': {'mode': 'purchase', 'construction_intent': 'repair'}}
        for readback in [{**before, 'repairObserved': False}, {**before, 'turn': 63, 'repairObserved': True},
                         TimeoutError, asyncio.CancelledError]:
            with patch('civ7.actions.run_script', new_callable=AsyncMock,
                       side_effect=[submitted, readback]) as run, patch('civ7.actions._VERIFICATION_TIMEOUT', 0.01):
                if readback is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.purchase_repair(**args)
                else:
                    self.assertEqual((await actions.purchase_repair(**args))['status'], 'unknown')
                self.assertEqual(run.await_count, 2)

    async def test_intents_use_strict_opt_in_native_append_with_captured_tile(self):
        self.assertTrue(callable(getattr(actions, 'append_advanced_construction', None)))
        for intent in ('wonder', 'repair', 'overbuild', 'improvement'):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
                await actions.append_advanced_construction('Home', 'CONSTRUCTIBLE_TEST', intent, 3, 3, '[]', 62)
            self.assertEqual(run.await_args.args, ('advanced_construction.js', {'settlement': 'Home', 'item': 'CONSTRUCTIBLE_TEST', 'construction_intent': intent,
                'x': 3, 'y': 3, 'target_token': '[]', 'expected_turn': 62, 'replace_improvement': False}))
        self.assertNotIn('append_civ7_advanced_construction', {t.name for t in create_server()._tool_manager.list_tools()})
        self.assertIn('append_civ7_advanced_construction', {t.name for t in create_server(enable_writes=True)._tool_manager.list_tools()})
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError): await actions.append_advanced_construction('Home', 'X', 'raw', 3, 3, '[]', 62)
            with self.assertRaises(ValueError): await actions.append_advanced_construction('Home', 'X', 'wonder', True, 3, '[]', 62)
            run.assert_not_awaited()

    async def test_mcp_building_improvement_replacement_forwards_opt_in_token_and_verifies_queue_once(self):
        args = {'settlement': 'Divodurum', 'item': 'BUILDING_TEMPLE', 'construction_intent': 'overbuild',
                'x': 20, 'y': 8, 'target_token': '[{"owner":0,"instanceId":20,"componentType":2,"type":200,"complete":true,"damaged":false}]',
                'expected_turn': 32, 'replace_improvement': True}
        before = {'turn': 32, 'age': 42, 'playerId': 0}
        expected = {'cityId': 7, 'item': 'BUILDING_TEMPLE', 'queueAppendObserved': True}
        verification = {'mode': 'append', 'city_id': 7, 'item': 'BUILDING_TEMPLE', 'x': 20, 'y': 8,
                        'baseline_queue': [], 'baseline_asset_ids': [], 'construction_intent': 'overbuild'}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected, 'verificationArguments': verification},
            {**before, **expected}]) as run:
            result = await create_server(enable_writes=True).call_tool('append_civ7_advanced_construction', args)
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list],
                         [('advanced_construction.js', args), ('city_construction_state.js', verification)])

    async def test_replacement_validation_unknown_and_cancellation_never_resubmit(self):
        args = ('Home', 'BUILDING_TEMPLE', 'overbuild', 3, 3, '[]', 62)
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ValueError):
                await actions.append_advanced_construction('Home', 'X', 'repair', 3, 3, '[]', 62, True)
            with self.assertRaises(ValueError):
                await actions.append_advanced_construction(*args, replace_improvement='true')
            run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=TimeoutError) as run:
            self.assertEqual((await actions.append_advanced_construction(*args, replace_improvement=True))['status'], 'unknown')
            self.assertEqual(run.await_count, 1)
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.append_advanced_construction(*args, replace_improvement=True)
            self.assertEqual(run.await_count, 1)
