import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


class TransitionCivilizationTests(unittest.IsolatedAsyncioTestCase):
    def action(self):
        self.assertTrue(callable(getattr(actions, 'select_transition_civilization', None)),
                        'typed transition civilization action exists')
        return actions.select_transition_civilization

    async def test_opt_in_typed_action_and_verified_readback(self):
        action = self.action()
        args = {'civilization': 'CIVILIZATION_PRUSSIA', 'selection_token': 'fresh', 'expected_turn': 113}
        before = {'turn': 113, 'age': 1, 'playerId': 0}
        expected = {'selected': 'CIVILIZATION_PRUSSIA', 'selectionOpen': True}
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[
            {'status': 'submitted', 'before': before, 'expected': expected}, {**before, **expected},
        ]) as run:
            result = await action(**args)
        self.assertEqual(result['status'], 'verified_applied')
        self.assertEqual([call.args for call in run.await_args_list], [
            ('select_transition_civilization.js', args), ('transition_civilization_state.js',),
        ])
        self.assertNotIn('select_civ7_transition_civilization', {t.name for t in create_server()._tool_manager.list_tools()})
        tool = next(t for t in create_server(enable_writes=True)._tool_manager.list_tools()
                    if t.name == 'select_civ7_transition_civilization')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)

    async def test_invalid_inputs_never_reach_transport(self):
        action = self.action()
        args = {'civilization': 'CIVILIZATION_PRUSSIA', 'selection_token': 'fresh', 'expected_turn': 113}
        for changes in ({'civilization': ''}, {'civilization': ' '}, {'civilization': 3},
                        {'selection_token': ''}, {'selection_token': 3}, {'selection_token': 'x' * 250001},
                        {'expected_turn': True}, {'expected_turn': -1}, {'expected_turn': 2**53}):
            with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await action(**{**args, **changes})
                run.assert_not_awaited()
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool('select_civ7_transition_civilization',
                                                                {**args, 'expected_turn': True})
            run.assert_not_awaited()

    async def test_unknown_and_cancelled_outcomes_never_resubmit(self):
        action = self.action()
        for error in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(error):
                        await action('CIVILIZATION_PRUSSIA', 'fresh', 113)
                else:
                    self.assertEqual((await action('CIVILIZATION_PRUSSIA', 'fresh', 113))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)
        before = {'turn': 113, 'age': 1, 'playerId': 0}
        async def response(script, arguments=None):
            return ({'status': 'submitted', 'before': before, 'expected': {'selected': 'CIVILIZATION_PRUSSIA'}}
                    if script == 'select_transition_civilization.js' else {**before, 'selected': 'RANDOM'})
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=response) as run, \
                patch('civ7.actions._VERIFICATION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
            self.assertEqual((await action('CIVILIZATION_PRUSSIA', 'fresh', 113))['status'], 'unknown')
        self.assertEqual(sum(c.args[0] == 'select_transition_civilization.js' for c in run.await_args_list), 1)
