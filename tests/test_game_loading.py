import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions, connection, queries
from sidkick.server import create_server


BEFORE = {'turn': 40, 'age': 1, 'playerId': 0, 'previousAgeCount': 0,
          'ageType': 'AGE_ANTIQUITY', 'civilization': 'CIVILIZATION_MAYA', 'phase': 'awaiting_begin'}
AFTER = {**BEFORE, 'phase': 'started', 'loadCompleted': True}


class GameLoadingTests(unittest.IsolatedAsyncioTestCase):
    async def test_reader_and_opt_in_begin_are_exposed(self):
        normal = {t.name: t for t in create_server()._tool_manager.list_tools()}
        enabled = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn('get_civ7_loading_state', normal)
        self.assertTrue(normal['get_civ7_loading_state'].annotations.read_only_hint)
        self.assertNotIn('begin_civ7_loaded_game', normal)
        self.assertIn('begin_civ7_loaded_game', enabled)
        self.assertFalse(enabled['begin_civ7_loaded_game'].annotations.idempotent_hint)
        self.assertFalse(enabled['begin_civ7_loaded_game'].annotations.read_only_hint)

    async def test_fixed_loading_transport_does_not_relax_gameplay_gate(self):
        self.assertTrue(callable(getattr(connection, 'run_game_loading_script', None)))
        with patch('civ7.connection._run_script', new_callable=AsyncMock, return_value={}) as run:
            await connection.run_game_loading_script({'operation': 'observe'})
        run.assert_awaited_once_with('game_loading.js', {'operation': 'observe'}, require_started=False)
        self.assertIs(actions.run_script, connection.run_started_script)

    async def test_read_only_observer_does_not_submit_begin(self):
        self.assertTrue(callable(getattr(queries, 'loading_state', None)))
        with patch('civ7.queries.run_game_loading_script', new_callable=AsyncMock, return_value=BEFORE) as run:
            self.assertEqual(await queries.loading_state(), BEFORE)
        run.assert_awaited_once_with({'operation': 'observe'})

    async def test_mcp_dispatches_reader_and_begin_and_rejects_coerced_tokens(self):
        server = create_server(enable_writes=True)
        with patch('civ7.queries.run_game_loading_script', new_callable=AsyncMock, return_value=BEFORE):
            result = await server.call_tool('get_civ7_loading_state', {})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, BEFORE)
        with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': BEFORE}, AFTER,
        ]) as run:
            result = await server.call_tool('begin_civ7_loaded_game', {'loading_token': 'fresh'})
            self.assertFalse(result.is_error)
            self.assertEqual(result.structured_content['status'], 'verified_applied')
            self.assertEqual(run.await_count, 2)
        with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await server.call_tool('begin_civ7_loaded_game', {'loading_token': 123})
            run.assert_not_awaited()

    async def test_begin_submits_once_and_verifies_same_started_context(self):
        self.assertTrue(callable(getattr(actions, 'begin_loaded_game', None)))
        with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': BEFORE}, {'phase': 'loading'}, AFTER,
        ]) as run, patch('civ7.actions.asyncio.sleep', new_callable=AsyncMock):
            result = await actions.begin_loaded_game('fresh')
        self.assertEqual(result['status'], 'verified_applied')
        self.assertTrue(result['loadCompleted'])
        self.assertEqual(result['nextAction'], 'get_civ7_turn_context')
        self.assertEqual([call.args[0]['operation'] for call in run.await_args_list], ['begin', 'observe', 'observe'])

    async def test_changed_context_and_timeout_are_unknown_never_success_or_resubmitted(self):
        self.assertTrue(callable(getattr(actions, 'begin_loaded_game', None)))
        for after in [{**AFTER, 'turn': 41}, {**AFTER, 'civilization': 'OTHER'}, {'phase': 'loading'}]:
            with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock,
                       side_effect=lambda args: {'status': 'submitted', 'before': BEFORE} if args['operation'] == 'begin' else after) as run, \
                    patch('civ7.actions._LOAD_BEGIN_TIMEOUT', 0.01), patch('civ7.actions._VERIFICATION_INTERVAL', 0.002):
                result = await actions.begin_loaded_game('fresh')
            self.assertEqual(result['status'], 'unknown')
            self.assertFalse(result['loadCompleted'])
            self.assertEqual(sum(c.args[0]['operation'] == 'begin' for c in run.await_args_list), 1)

    async def test_invalid_rejected_and_unknown_requests_never_retry(self):
        self.assertTrue(callable(getattr(actions, 'begin_loaded_game', None)))
        with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock) as run:
            for token in ['', None, 1, 'x' * 250001]:
                with self.assertRaises(ValueError):
                    await actions.begin_loaded_game(token)
            run.assert_not_awaited()
        with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            self.assertEqual((await actions.begin_loaded_game('fresh'))['status'], 'rejected')
            run.assert_awaited_once()
        for error in [TimeoutError, asyncio.CancelledError]:
            with patch('civ7.actions.run_game_loading_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.begin_loaded_game('fresh')
                else:
                    self.assertEqual((await actions.begin_loaded_game('fresh'))['status'], 'unknown')
                run.assert_awaited_once()
