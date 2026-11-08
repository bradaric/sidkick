import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


CASES = [
    ("place_civ7_population", "place_population", ("Hanseong", 12, 37, "IMPROVEMENT_FISHING_BOAT", 59),
     {"settlement": "Hanseong", "x": 12, "y": 37, "improvement": "IMPROVEMENT_FISHING_BOAT", "expected_turn": 59},
     "place_population.js", "population_state.js", {"city_id": 10, "baseline_component_ids": []},
     {"cityId": 10, "pendingPopulation": 0, "newImprovementObserved": True}),
    ("rail_civ7_unit", "rail_unit", (20, 10, 15, 59),
     {"unit_id": 20, "x": 10, "y": 15, "expected_turn": 59, "mode": "rail"},
     "move_unit.js", "unit_position_state.js", {},
     {"unitId": 20, "unitType": 201, "componentType": 26, "location": {"x": 10, "y": 15}, "queueSize": 0}),
    ("advance_civ7_unit", "advance_unit", (20, 4, 10, 15, 59),
     {"unit_id": 20, "target_player": 4, "x": 10, "y": 15, "expected_turn": 59, "mode": "advance"},
     "move_unit.js", "unit_position_state.js", {},
     {"unitId": 20, "unitType": 201, "componentType": 26, "location": {"x": 10, "y": 15}, "queueSize": 0}),
]
BEFORE = {"turn": 59, "age": 42, "playerId": 0}


class GrowthAndMovementTests(unittest.IsolatedAsyncioTestCase):
    async def test_normal_move_reports_observed_embarkation_without_predicting_hidden_terrain(self):
        before = {**BEFORE, "unitId": 20, "unitType": 201, "componentType": 26,
                  "moveOperation": 900, "location": {"x": 9, "y": 15}}
        after = {**before, "present": True, "location": {"x": 10, "y": 15}, "embarked": True, "queueSize": 0}
        submitted = {"status": "submitted", "before": before}
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[
            submitted, after,
        ]) as run, patch("civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.move_unit(20, 10, 15, 59)
        self.assertEqual(result["status"], "verified_applied")
        self.assertTrue(result["after"]["embarked"])
        self.assertEqual(run.await_count, 2)
        self.assertEqual([call.args[0] for call in run.await_args_list],
                         ["move_unit.js", "normal_move_state.js"])

    async def test_wrappers_pass_json_arguments_and_poll_without_resubmission(self):
        for _, fn, positional, args, script, state, captured, expected in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            read_args = {**args, **captured}
            submitted = {"status": "submitted", "before": BEFORE, "expected": expected,
                         "verificationArguments": read_args}
            with self.subTest(fn=fn), patch("civ7.actions.run_script", new_callable=AsyncMock,
                                           side_effect=[submitted, BEFORE, {**BEFORE, **expected}]) as run, patch(
                                               "civ7.actions.asyncio.sleep", new_callable=AsyncMock):
                result = await getattr(actions, fn)(*positional)
                self.assertEqual(result["status"], "verified_applied")
                self.assertEqual(run.await_args_list[0].args, (script, args))
                self.assertEqual([call.args for call in run.await_args_list[1:]], [(state, read_args)] * 2)

    async def test_rejection_unknown_and_cancellation_never_retry(self):
        for _, fn, positional, *_ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            with patch("civ7.actions.run_script", new_callable=AsyncMock, return_value={"status": "rejected"}) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))["status"], "rejected")
                self.assertEqual(run.await_count, 1)
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=TimeoutError) as run:
                self.assertEqual((await getattr(actions, fn)(*positional))["status"], "unknown")
                self.assertEqual(run.await_count, 1)
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=asyncio.CancelledError) as run:
                with self.assertRaises(asyncio.CancelledError):
                    await getattr(actions, fn)(*positional)
                self.assertEqual(run.await_count, 1)

    async def test_bad_inputs_do_not_reach_transport(self):
        for _, fn, positional, *_ in CASES:
            self.assertTrue(callable(getattr(actions, fn, None)))
            malformed = list(positional)
            malformed[1] = True
            with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
                with self.assertRaises(ValueError):
                    await getattr(actions, fn)(*malformed)
                run.assert_not_awaited()

    async def test_mcp_tools_are_opt_in_mutating_strict_and_return_structured_results(self):
        normal = {t.name for t in create_server()._tool_manager.list_tools()}
        tools = {t.name: t for t in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, _, _, args, _, _, _, expected in CASES:
            args = {k: v for k, v in args.items() if k != "mode"}
            self.assertNotIn(name, normal)
            self.assertIn(name, set(tools))
            self.assertFalse(tools[name].annotations.read_only_hint)
            self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            self.assertEqual(set(tools[name].parameters["required"]), set(args))
            with patch("civ7.actions.run_script", new_callable=AsyncMock,
                       side_effect=[{"status": "submitted", "before": BEFORE, "expected": expected}, {**BEFORE, **expected}]):
                result = await create_server(enable_writes=True).call_tool(name, args)
            self.assertFalse(result.is_error)
            self.assertEqual(result.structured_content["status"], "verified_applied")
            with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool(name, {**args, "x": True})
                run.assert_not_awaited()
