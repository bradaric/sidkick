import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import actions, queries, connection
from sidkick.server import create_server


CONTEXT = {'mode': 'game', 'turn': 40, 'age': -123, 'playerId': 0, 'ageType': 'AGE_EXPLORATION'}
FILE = {'fileName': 'Fresh.Civ7Save', 'displayName': 'Fresh', 'currentTurn': 40,
        'age': 'AGE_EXPLORATION', 'saveToken': 'exact', 'canLoad': True}
INVENTORY = {'status': 'ready', 'inventoryId': 'fresh-inventory', 'context': CONTEXT, 'saves': []}


class SaveLoadTests(unittest.IsolatedAsyncioTestCase):
    async def test_tools_are_read_only_browser_and_opt_in_strict_writers(self):
        normal = {t.name: t for t in create_server()._tool_manager.list_tools()}
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('get_civ7_saved_games', normal)
        self.assertTrue(normal['get_civ7_saved_games'].annotations.read_only_hint)
        for name in ('save_civ7_game', 'load_civ7_game'):
            self.assertNotIn(name, normal)
            self.assertFalse(enabled[name].annotations.read_only_hint)
            self.assertFalse(enabled[name].annotations.idempotent_hint)
        self.assertTrue(enabled['load_civ7_game'].annotations.destructive_hint)

    async def test_save_submits_once_then_requires_serializer_success_and_new_exact_file(self):
        with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock, side_effect=[
                INVENTORY, {**INVENTORY, 'saves': [FILE]}]), \
                patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                    {'status': 'submitted', 'before': CONTEXT, 'requestId': 'saving'},
                    {'status': 'ready', 'context': CONTEXT, 'serializerComplete': False},
                    {'status': 'ready', 'context': CONTEXT, 'serializerComplete': True, 'serializerOk': True},
                ]) as run, patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.save_game('Fresh', 40)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([c.args[1]['operation'] for c in run.await_args_list], ['save', 'save_state', 'save_state'])
        self.assertEqual(result['save']['saveToken'], 'exact')

    async def test_load_refreshes_inventory_and_uses_only_fixed_load_transport_once(self):
        for expected_turn in (40, None):
            inventory = {**INVENTORY, 'context': CONTEXT if expected_turn is not None else {'mode': 'menu'}, 'saves': [FILE]}
            with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock, return_value=inventory), \
                    patch('civ7.actions.run_load_game_script', new_callable=AsyncMock,
                          return_value={'status': 'submitted', 'loadCompleted': False}) as run:
                result = await actions.load_game('exact', True, expected_turn)
            self.assertEqual(result['status'], 'submitted')
            self.assertFalse(result['loadCompleted'])
            run.assert_awaited_once_with({'inventory_id': 'fresh-inventory', 'save_token': 'exact',
                                         'confirm_discard_unsaved_progress': True, 'expected_turn': expected_turn})
        self.assertTrue(callable(getattr(connection, 'run_load_game_script', None)))

    async def test_save_and_load_unknown_or_cancelled_never_resubmit(self):
        for failure in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock, return_value=INVENTORY), \
                    patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=failure) as save:
                if failure is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError): await actions.save_game('Fresh', 40)
                else: self.assertEqual((await actions.save_game('Fresh', 40))['status'], 'unknown')
                self.assertEqual(save.await_count, 1)
            with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock, return_value={**INVENTORY, 'saves': [FILE]}), \
                    patch('civ7.actions.run_load_game_script', new_callable=AsyncMock, side_effect=failure) as load:
                if failure is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError): await actions.load_game('exact', True, 40)
                else: self.assertEqual((await actions.load_game('exact', True, 40))['status'], 'unknown')
                self.assertEqual(load.await_count, 1)

    async def test_invalid_inputs_never_reach_inventory_or_transport(self):
        with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock) as inventory:
            for name, turn in [('../escape', 40), ('CON', 40), ('Fresh', True), ('', 40)]:
                with self.assertRaises(ValueError): await actions.save_game(name, turn)
            for token, confirmation, turn in [('', True, 40), ('exact', False, 40), ('exact', 1, 40), ('exact', True, True)]:
                with self.assertRaises(ValueError): await actions.load_game(token, confirmation, turn)
            inventory.assert_not_awaited()

    async def test_browser_paginates_without_exposing_internal_inventory(self):
        with patch('civ7.queries.read_save_inventory', new_callable=AsyncMock,
                   return_value={**INVENTORY, 'saves': [FILE, {**FILE, 'fileName': 'Other.Civ7Save'}]}):
            result = await queries.saved_games(limit=1, offset=1)
        self.assertEqual(len(result['saves']), 1)
        self.assertEqual(result['total'], 2)
        self.assertNotIn('inventoryId', result)

    async def test_save_never_claims_success_from_serializer_alone_or_changed_context(self):
        for state, after in [
            ({'serializerComplete': True, 'serializerOk': False}, INVENTORY),
            ({'serializerComplete': True, 'serializerOk': True}, INVENTORY),
            ({'serializerComplete': True, 'serializerOk': True}, {**INVENTORY, 'saves': [{**FILE, 'currentTurn': 39}]}),
            ({'context': {'mode': 'menu'}}, INVENTORY),
        ]:
            with patch('civ7.actions.read_save_inventory', new_callable=AsyncMock, side_effect=[INVENTORY, after]), \
                    patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
                        {'status': 'submitted', 'before': CONTEXT, 'requestId': 'saving'},
                        {'status': 'ready', 'context': CONTEXT, **state},
                    ]) as run:
                result = await actions.save_game('Fresh', 40)
            self.assertEqual(result['status'], 'unknown')
            self.assertEqual(run.await_count, 2)

    async def test_menu_loader_pins_its_script_and_operation_without_weakening_gameplay_guard(self):
        with patch('civ7.connection._run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await connection.run_load_game_script({'operation': 'save', 'script_name': 'outside.js'})
        run.assert_awaited_once_with('save_load.js', {'operation': 'load', 'script_name': 'outside.js'}, require_started=False)
        self.assertIs(actions.run_script, connection.run_started_script)

    async def test_native_metadata_query_is_single_start_with_matching_poll_and_cleanup(self):
        from civ7.save_games import read_save_inventory
        with patch('civ7.save_games.run_script', new_callable=AsyncMock, side_effect=[
                {'status': 'pending'}, INVENTORY, {'status': 'closed'}]) as run, \
                patch('civ7.save_games.asyncio.sleep', new_callable=AsyncMock):
            result = await read_save_inventory()
        self.assertEqual(result, INVENTORY)
        self.assertEqual([c.args[1]['operation'] for c in run.await_args_list], ['list_start', 'list_poll', 'list_close'])
        self.assertEqual(len({c.args[1]['request_id'] for c in run.await_args_list}), 1)
