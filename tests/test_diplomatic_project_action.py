import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


ACTION = "DIPLOMACY_ACTION_RESEARCH_COLLABORATION"
ARGS = {"target_kind": "major", "target_player_id": 3, "action": ACTION,
        "max_influence_cost": 150, "expected_turn": 58}
BEFORE = {"turn": 58, "age": 42, "playerId": 0, "eventIds": [40], "influence": 1000}
EXPECTED = {"targetPlayerId": 3, "targetKind": "major", "action": ACTION, "newProjectObserved": True}
READ_ARGS = {**ARGS, "baseline_event_ids": [40]}
SUBMITTED = {"status": "submitted", "before": BEFORE, "expected": EXPECTED,
             "verificationArguments": READ_ARGS}
AFTER = {**BEFORE, **EXPECTED, "influence": 850, "newProjects": [{"id": 90}]}


class ProjectActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_major_project_passes_captured_baseline_to_readback_without_resubmitting(self):
        self.assertTrue(callable(getattr(actions, "start_diplomatic_project", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[SUBMITTED, {**AFTER, "newProjectObserved": False}, AFTER]) as run, patch(
                       "civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.start_diplomatic_project(3, f" {ACTION} ", 150, 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("start_diplomatic_project.js", ARGS))
        self.assertEqual([call.args for call in run.await_args_list[1:]],
                         [("diplomatic_project_state.js", READ_ARGS)] * 2)

    async def test_city_state_wrapper_uses_a_fixed_kind_and_budget_data(self):
        self.assertTrue(callable(getattr(actions, "start_city_state_project", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   return_value={"status": "rejected", "reason": "Over cap"}) as run:
            result = await actions.start_city_state_project(8, "DIPLOMACY_ACTION_CS_INCORPORATE", 720, 58)
        self.assertEqual(result["status"], "rejected")
        run.assert_awaited_once_with("start_diplomatic_project.js", {
            "target_kind": "city-state", "target_player_id": 8, "action": "DIPLOMACY_ACTION_CS_INCORPORATE",
            "max_influence_cost": 720, "expected_turn": 58,
        })

    async def test_invalid_project_inputs_never_reach_the_game(self):
        self.assertTrue(callable(getattr(actions, "start_diplomatic_project", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [(True, ACTION, 150, 58), (3, " ", 150, 58), (3, ACTION, True, 58),
                         (3, ACTION, -1, 58), (3, ACTION, float("inf"), 58), (3, ACTION, 150, True)]:
                with self.assertRaises(ValueError):
                    await actions.start_diplomatic_project(*args)
            run.assert_not_awaited()

    async def test_ambiguous_submission_and_cancellation_are_not_retried(self):
        self.assertTrue(callable(getattr(actions, "start_diplomatic_project", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=TimeoutError) as run:
            result = await actions.start_diplomatic_project(3, ACTION, 150, 58)
            self.assertEqual(result["status"], "unknown")
            self.assertEqual(run.await_count, 1)
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[SUBMITTED, asyncio.CancelledError]) as run:
            with self.assertRaises(asyncio.CancelledError):
                await actions.start_diplomatic_project(3, ACTION, 150, 58)
            self.assertEqual(run.await_count, 2)

    async def test_project_tools_are_opt_in_mutating_and_return_structured_mcp_results(self):
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name in ("start_civ7_diplomatic_project", "start_civ7_city_state_project"):
            self.assertNotIn(name, normal)
            self.assertIn(name, set(tools))
            self.assertFalse(tools[name].annotations.read_only_hint)
            self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            self.assertEqual(set(tools[name].parameters["required"]),
                             {"target_player_id", "action", "max_influence_cost", "expected_turn"})
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[SUBMITTED, AFTER]):
            result = await create_server(enable_writes=True).call_tool("start_civ7_diplomatic_project", {
                key: value for key, value in ARGS.items() if key != "target_kind"
            })
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "verified_applied")
        city_action = "DIPLOMACY_ACTION_CS_INCORPORATE"
        city_args = {"target_kind": "city-state", "target_player_id": 8, "action": city_action,
                     "max_influence_cost": 720, "expected_turn": 58}
        city_expected = {**EXPECTED, "targetPlayerId": 8, "targetKind": "city-state", "action": city_action}
        city_submitted = {**SUBMITTED, "expected": city_expected,
                          "verificationArguments": {**city_args, "baseline_event_ids": [40]}}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[city_submitted, {**AFTER, **city_expected}]):
            city_result = await create_server(enable_writes=True).call_tool("start_civ7_city_state_project", {
                key: value for key, value in city_args.items() if key != "target_kind"
            })
        self.assertFalse(city_result.is_error)
        self.assertEqual(city_result.structured_content["status"], "verified_applied")
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool("start_civ7_diplomatic_project", {
                    "target_player_id": 3, "action": ACTION, "max_influence_cost": True, "expected_turn": 58,
                })
            run.assert_not_awaited()
