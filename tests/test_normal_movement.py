import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import actions
from sidkick.server import create_server


BEFORE = {'turn': 1, 'age': 42, 'playerId': 0, 'unitId': 7, 'unitType': 101, 'componentType': 26,
          'location': {'x': 1, 'y': 1}, 'moveOperation': 900, 'queueSize': 0}
ARGS = {'unit_id': 7, 'x': 20, 'y': 20, 'expected_turn': 1, 'mode': 'normal'}


class NormalMovementTests(unittest.IsolatedAsyncioTestCase):
    async def test_unobserved_submission_times_out_without_another_move_request(self):
        submitted = {'status': 'submitted', 'before': BEFORE}
        after = {**BEFORE, 'present': True, 'operation': None}
        async def response(script, arguments):
            return submitted if script == 'move_unit.js' else after
        with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=response) as run, \
                patch('civ7.actions._COMBAT_VERIFICATION_TIMEOUT', 0.02), patch('civ7.actions._VERIFICATION_INTERVAL', 0.005):
            result = await actions.move_unit(7, 20, 20, 1)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(sum(call.args[0] == 'move_unit.js' for call in run.await_args_list), 1)

    async def test_arrival_partial_movement_and_observed_queue_are_distinct(self):
        for location, queue, expected_status, outcome in [
            ({'x': 20, 'y': 20}, 0, 'verified_applied', 'arrived'),
            ({'x': 3, 'y': 2}, 0, 'verified_partial', 'moved_partway'),
            ({'x': 1, 'y': 1}, 1, 'submitted', 'move_order_observed'),
        ]:
            after = {**BEFORE, 'present': True, 'location': location, 'queueSize': queue,
                     'operation': 900 if queue else None, 'movesRemaining': 0, 'damage': 10}
            submitted = {'status': 'submitted', 'before': BEFORE, 'verificationArguments': {'unit_id': 7}}
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[submitted, after]) as run:
                result = await actions.move_unit(7, 20, 20, 1)
            self.assertEqual(result['status'], expected_status)
            self.assertEqual(result['outcome'], outcome)
            self.assertEqual(run.await_args_list[0].args, ('move_unit.js', ARGS))
            self.assertEqual(run.await_args_list[1].args, ('normal_move_state.js', {'unit_id': 7}))
            if queue:
                self.assertFalse(result['queuedTargetVerified'])

    async def test_lost_identity_unknown_and_cancelled_submissions_are_not_retried(self):
        submitted = {'status': 'submitted', 'before': BEFORE, 'verificationArguments': {'unit_id': 7}}
        for after in ({**BEFORE, 'present': False}, {**BEFORE, 'present': True, 'turn': 2},
                      {**BEFORE, 'present': True, 'isDead': True, 'location': {'x': 20, 'y': 20}}):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=[submitted, after]) as run:
                self.assertEqual((await actions.move_unit(7, 20, 20, 1))['status'], 'unknown')
            self.assertEqual(run.await_count, 2)
        for error in (TimeoutError, asyncio.CancelledError):
            with patch('civ7.actions.run_script', new_callable=AsyncMock, side_effect=error) as run:
                if error is asyncio.CancelledError:
                    with self.assertRaises(error):
                        await actions.move_unit(7, 20, 20, 1)
                else:
                    self.assertEqual((await actions.move_unit(7, 20, 20, 1))['status'], 'unknown')
                self.assertEqual(run.await_count, 1)

    async def test_default_movement_tool_is_strictly_typed_opt_in_but_fog_capable(self):
        self.assertNotIn('move_civ7_unit', {tool.name for tool in create_server()._tool_manager.list_tools()})
        server = create_server(enable_writes=True)
        tool = next(tool for tool in server._tool_manager.list_tools() if tool.name == 'move_civ7_unit')
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertIn('fog', tool.description.lower())
        with patch('civ7.actions.run_script', new_callable=AsyncMock, return_value={'status': 'rejected'}) as run:
            await server.call_tool('move_civ7_unit', {'unit_id': 7, 'x': 20, 'y': 20, 'expected_turn': 1})
            self.assertEqual(run.await_args.args, ('move_unit.js', ARGS))
        with patch('civ7.actions.run_script', new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await server.call_tool('move_civ7_unit', {'unit_id': True, 'x': 20, 'y': 20, 'expected_turn': 1})
            run.assert_not_awaited()
