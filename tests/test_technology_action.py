import asyncio
from contextlib import redirect_stderr
import io
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server, main


BEFORE = {"turn": 58, "age": 42, "playerId": 0, "activeTechnology": "NODE_TECH_A"}
SUBMITTED = {"status": "submitted", "technology": "NODE_TECH_B", "before": BEFORE}
AFTER = {**BEFORE, "activeTechnology": "NODE_TECH_B"}


class TechnologyActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_submits_once_then_verifies_with_a_separate_read(self):
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[SUBMITTED, AFTER]) as run:
            result = await actions.select_technology(" NODE_TECH_B ", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(result["after"], AFTER)
        self.assertEqual(run.await_count, 2)
        self.assertEqual(run.await_args_list[0].args, ("select_technology.js", {
            "technology": "NODE_TECH_B", "expected_turn": 58,
        }))
        self.assertEqual(run.await_args_list[1].args, ("technology_state.js",))

    async def test_invalid_input_never_reaches_the_transport(self):
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for technology, turn in [(" ", 58), (102, 58), ("NODE_TECH_B", True),
                                     ("NODE_TECH_B", -1), ("NODE_TECH_B", 58.5)]:
                with self.subTest(technology=technology, turn=turn), self.assertRaises(ValueError):
                    await actions.select_technology(technology, turn)
            run.assert_not_awaited()

    async def test_rejection_and_already_active_do_not_submit_or_read_again(self):
        for status in ("rejected", "already_active"):
            data = {**SUBMITTED, "status": status}
            with patch("civ7.actions.run_script", new_callable=AsyncMock, return_value=data) as run:
                self.assertEqual(await actions.select_technology("NODE_TECH_B", 58), data)
                self.assertEqual(run.await_count, 1)

    async def test_delayed_application_is_verified_by_reading_again_without_resubmission(self):
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[SUBMITTED, BEFORE, BEFORE, AFTER]) as run, patch(
                       "civ7.actions.asyncio.sleep", new_callable=AsyncMock) as wait:
            result = await actions.select_technology("NODE_TECH_B", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(result["after"], AFTER)
        self.assertEqual([call.args[0] for call in run.await_args_list],
                         ["select_technology.js"] + ["technology_state.js"] * 3)
        self.assertEqual(wait.await_count, 2)

    async def test_changed_or_missing_context_is_unknown_without_further_reads(self):
        for after in [{**AFTER, "turn": 59}, {**AFTER, "age": 43},
                      {**AFTER, "playerId": 1}, {"activeTechnology": "NODE_TECH_B"}]:
            with self.subTest(after=after), patch("civ7.actions.run_script", new_callable=AsyncMock,
                                                side_effect=[SUBMITTED, after]) as run:
                result = await actions.select_technology("NODE_TECH_B", 58)
                self.assertEqual(result["status"], "unknown")
                self.assertEqual(run.await_count, 2)

    async def test_unapplied_selection_stops_at_the_verification_deadline(self):
        async def response(script, *args):
            return SUBMITTED if script == "select_technology.js" else BEFORE

        with patch("civ7.actions.run_script", side_effect=response) as run, patch(
                "civ7.actions._VERIFICATION_TIMEOUT", 0.02), patch(
                "civ7.actions._VERIFICATION_INTERVAL", 0.001):
            result = await actions.select_technology("NODE_TECH_B", 58)
        self.assertEqual(result["status"], "unknown")
        self.assertIn("TimeoutError", result.get("error", ""))
        self.assertEqual(result["after"], BEFORE)
        self.assertGreater(run.await_count, 2)
        self.assertEqual(sum(call.args[0] == "select_technology.js" for call in run.await_args_list), 1)

    async def test_verification_deadline_also_bounds_a_hanging_read(self):
        async def response(script, *args):
            if script == "select_technology.js":
                return SUBMITTED
            await asyncio.Event().wait()

        with patch("civ7.actions.run_script", side_effect=response) as run, patch(
                "civ7.actions._VERIFICATION_TIMEOUT", 0.02):
            result = await asyncio.wait_for(actions.select_technology("NODE_TECH_B", 58), timeout=0.5)
        self.assertEqual(result["status"], "unknown")
        self.assertIn("TimeoutError", result.get("error", ""))
        self.assertEqual(run.await_count, 2)

    async def test_submission_or_readback_failure_is_unknown_and_not_retried(self):
        for responses, count in [([TimeoutError("lost response")], 1),
                                 ([SUBMITTED, OSError("disconnected")], 2)]:
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=responses) as run:
                result = await actions.select_technology("NODE_TECH_B", 58)
                self.assertEqual(result["status"], "unknown")
                self.assertIn("error", result)
                self.assertEqual(run.await_count, count)

    async def test_cancellation_propagates_without_retry(self):
        for responses, count in [([asyncio.CancelledError], 1), ([SUBMITTED, asyncio.CancelledError], 2)]:
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=responses) as run:
                with self.assertRaises(asyncio.CancelledError):
                    await actions.select_technology("NODE_TECH_B", 58)
                self.assertEqual(run.await_count, count)

    async def test_concurrent_actions_are_serialized_through_readback(self):
        first_started, release_first = asyncio.Event(), asyncio.Event()
        calls = []

        async def run(script, *args):
            calls.append(script)
            if len(calls) == 1:
                first_started.set()
                await release_first.wait()
            return SUBMITTED if script == "select_technology.js" else AFTER

        with patch("civ7.actions.run_script", side_effect=run):
            first = asyncio.create_task(actions.select_technology("NODE_TECH_B", 58))
            await first_started.wait()
            second = asyncio.create_task(actions.select_technology("NODE_TECH_B", 58))
            await asyncio.sleep(0)
            self.assertEqual(calls, ["select_technology.js"])
            release_first.set()
            await asyncio.gather(first, second)
        self.assertEqual(calls, ["select_technology.js", "technology_state.js"] * 2)


class WriteRegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_action_is_absent_by_default_and_explicitly_marked_mutating_when_enabled(self):
        normal = {tool.name: tool for tool in create_server()._tool_manager.list_tools()}
        enabled = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertEqual(set(enabled) - set(normal), {
            "select_civ7_technology", "select_civ7_civic", "set_civ7_policy_active",
            "assign_civ7_resource",
            "buy_civ7_attribute_node",
            "move_civ7_great_work",
            "start_civ7_diplomatic_project", "start_civ7_city_state_project",
            "append_civ7_city_production", "purchase_civ7_city_item",
            "establish_civ7_trade_route",
            "place_civ7_population", "move_civ7_unit",
            "set_civ7_town_focus", "upgrade_civ7_town", "assign_civ7_specialist",
            "set_civ7_unit_order", "end_civ7_turn",
            "choose_civ7_government", "choose_civ7_celebration", "review_civ7_resources",
            "acknowledge_civ7_agenda",
            "set_civ7_culture_card",
            "review_civ7_policies",
            "choose_civ7_narrative",
            "respond_civ7_diplomatic_project",
            "promote_civ7_unit",
            "upgrade_civ7_unit",
            "pack_civ7_commander", "unpack_civ7_commander",
            "reinforce_civ7_unit",
            "attack_civ7_unit",
            "move_civ7_commander",
            "ranged_attack_civ7_army",
            "join_civ7_commander", "leave_civ7_commander",
            "melee_attack_civ7_army",
            "overrun_civ7_unit",
            "grant_civ7_second_wind",
            "ranged_attack_civ7_enemy_field",
            "join_civ7_fleet", "leave_civ7_fleet",
            "rebase_civ7_aircraft",
            "naval_attack_civ7_unit",
            "rail_civ7_commander",
        })
        tool = enabled["select_civ7_technology"]
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        self.assertEqual(set(tool.parameters["required"]), {"technology", "expected_turn"})
        for name in normal:
            self.assertEqual(normal[name].annotations, enabled[name].annotations)

    async def test_mcp_action_returns_structured_verified_result(self):
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[SUBMITTED, AFTER]):
            result = await create_server(enable_writes=True).call_tool("select_civ7_technology", {
                "technology": "NODE_TECH_B", "expected_turn": 58,
            })
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "verified_applied")

    async def test_mcp_does_not_coerce_boolean_turns_or_numeric_selectors(self):
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [{"technology": "NODE_TECH_B", "expected_turn": True},
                         {"technology": 102, "expected_turn": 58}]:
                with self.assertRaises(ToolError):
                    await create_server(enable_writes=True).call_tool("select_civ7_technology", args)
            run.assert_not_awaited()


class WriteCliTests(unittest.TestCase):
    def test_enable_writes_is_rejected_for_http_before_server_creation(self):
        with patch("sys.argv", ["sidkick-server", "--enable-writes"]), patch("sidkick.server.create_server") as create:
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                main()
            self.assertEqual(caught.exception.code, 2)
            create.assert_not_called()

    def test_stdio_requires_explicit_opt_in(self):
        for enabled in (False, True):
            args = ["sidkick-server", "--transport", "stdio"] + (["--enable-writes"] if enabled else [])
            with patch("sys.argv", args), patch("sidkick.server.create_server") as create:
                main()
                create.assert_called_once_with(enable_writes=enabled)
                create.return_value.run.assert_called_once_with(transport="stdio")


class CivicActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_civic_selection_uses_its_own_scripts_and_verifies_delayed_application(self):
        self.assertTrue(callable(getattr(actions, "select_civic", None)))
        before = {"turn": 58, "age": 42, "playerId": 0, "activeCivic": "NODE_CIVIC_A"}
        after = {**before, "activeCivic": "NODE_CIVIC_B"}
        submitted = {"status": "submitted", "civic": "NODE_CIVIC_B", "before": before}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[submitted, before, after]) as run, patch(
                       "civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.select_civic(" NODE_CIVIC_B ", 58)
        self.assertEqual(result, {**submitted, "status": "verified_applied", "after": after})
        self.assertEqual(run.await_args_list[0].args, ("select_civic.js", {
            "civic": "NODE_CIVIC_B", "expected_turn": 58,
        }))
        self.assertEqual([call.args[0] for call in run.await_args_list],
                         ["select_civic.js", "civic_state.js", "civic_state.js"])

    async def test_civic_inputs_are_validated_before_any_game_call(self):
        self.assertTrue(callable(getattr(actions, "select_civic", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for civic, turn in [(" ", 58), (123, 58), ("NODE_CIVIC_B", True), ("NODE_CIVIC_B", -1)]:
                with self.assertRaises(ValueError):
                    await actions.select_civic(civic, turn)
            run.assert_not_awaited()

    async def test_civic_tool_requires_civic_and_turn_and_is_explicitly_mutating(self):
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertIn("select_civ7_civic", tools)
        tool = tools["select_civ7_civic"]
        self.assertEqual(set(tool.parameters["required"]), {"civic", "expected_turn"})
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        before = {"turn": 58, "age": 42, "playerId": 0, "activeCivic": "NODE_CIVIC_A"}
        after = {**before, "activeCivic": "NODE_CIVIC_B"}
        submitted = {"status": "submitted", "civic": "NODE_CIVIC_B", "before": before}
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[submitted, after]):
            result = await create_server(enable_writes=True).call_tool("select_civ7_civic", {
                "civic": "NODE_CIVIC_B", "expected_turn": 58,
            })
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "verified_applied")

    async def test_civic_cannot_be_verified_against_technology_state(self):
        self.assertTrue(callable(getattr(actions, "select_civic", None)))
        before = {"turn": 58, "age": 42, "playerId": 0, "activeCivic": "NODE_CIVIC_A"}
        submitted = {"status": "submitted", "civic": "NODE_CIVIC_B", "before": before}
        async def response(script, *args):
            return submitted if script == "select_civic.js" else {**BEFORE, "activeTechnology": "NODE_CIVIC_B"}
        with patch("civ7.actions.run_script", side_effect=response), patch(
                "civ7.actions._VERIFICATION_TIMEOUT", 0.02):
            result = await actions.select_civic("NODE_CIVIC_B", 58)
        self.assertEqual(result["status"], "unknown")
