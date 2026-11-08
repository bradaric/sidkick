import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


class ConstructionActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_append_wrapper_captures_queue_readback_arguments_and_polls_without_resubmission(self):
        self.assertTrue(callable(getattr(actions, "append_city_production", None)))
        arguments = {"mode": "append", "settlement": "Copan", "item": "UNIT_SCOUT", "expected_turn": 58,
                     "x": None, "y": None, "max_gold_cost": None}
        before = {"turn": 58, "age": 42, "playerId": 0}
        read_args = {**arguments, "city_id": 10, "baseline_queue": [{"type": 101}]}
        expected = {"cityId": 10, "item": "UNIT_SCOUT", "queueAppendObserved": True}
        submitted = {"status": "submitted", "before": before, "expected": expected,
                     "verificationArguments": read_args}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[submitted, {**before, **expected, "queueAppendObserved": False},
                                {**before, **expected}]) as run, patch("civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.append_city_production(" Copan ", " UNIT_SCOUT ", 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(run.await_args_list[0].args, ("apply_city_construction.js", arguments))
        self.assertEqual([call.args for call in run.await_args_list[1:]],
                         [("city_construction_state.js", read_args)] * 2)

    async def test_purchase_wrapper_passes_exact_tile_cap_and_native_rejection_without_polling(self):
        self.assertTrue(callable(getattr(actions, "purchase_city_item", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   return_value={"status": "rejected", "reason": "Over cap"}) as run:
            result = await actions.purchase_city_item("Roskilde", "BUILDING_QUAY", 220, 58, 24, 4)
        self.assertEqual(result["status"], "rejected")
        run.assert_awaited_once_with("apply_city_construction.js", {
            "mode": "purchase", "settlement": "Roskilde", "item": "BUILDING_QUAY", "max_gold_cost": 220,
            "expected_turn": 58, "x": 24, "y": 4,
        })

    async def test_invalid_inputs_do_not_reach_transport(self):
        self.assertTrue(callable(getattr(actions, "append_city_production", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for args in [(" ", "UNIT_SCOUT", 58), ("Copan", " ", 58), ("Copan", "UNIT_SCOUT", True),
                         ("Copan", "BUILDING_QUAY", 58, True, 4), ("Copan", "BUILDING_QUAY", 58, 24, None)]:
                with self.assertRaises(ValueError):
                    await actions.append_city_production(*args)
            for cap in (True, -1, float("inf"), "120"):
                with self.assertRaises(ValueError):
                    await actions.purchase_city_item("Copan", "UNIT_SCOUT", cap, 58)
            run.assert_not_awaited()

    async def test_uncertain_submission_is_never_retried_and_cancellation_propagates(self):
        self.assertTrue(callable(getattr(actions, "purchase_city_item", None)))
        for failure in (TimeoutError, asyncio.CancelledError):
            with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=failure) as run:
                if failure is asyncio.CancelledError:
                    with self.assertRaises(asyncio.CancelledError):
                        await actions.purchase_city_item("Copan", "UNIT_SCOUT", 120, 58)
                else:
                    result = await actions.purchase_city_item("Copan", "UNIT_SCOUT", 120, 58)
                    self.assertEqual(result["status"], "unknown")
                self.assertEqual(run.await_count, 1)

    async def test_mcp_tools_are_opt_in_mutating_and_strict(self):
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        for name, extra in [("append_civ7_city_production", set()), ("purchase_civ7_city_item", {"max_gold_cost"})]:
            self.assertNotIn(name, normal)
            self.assertIn(name, tools)
            self.assertFalse(tools[name].annotations.read_only_hint)
            self.assertTrue(tools[name].annotations.destructive_hint)
            self.assertFalse(tools[name].annotations.idempotent_hint)
            self.assertEqual(set(tools[name].parameters["required"]), {"settlement", "item", "expected_turn"} | extra)
            arguments = {"settlement": "Copan", "item": "UNIT_SCOUT", "expected_turn": 58,
                         **({"max_gold_cost": 120} if extra else {})}
            before = {"turn": 58, "age": 42, "playerId": 0}
            expected = {"cityId": 10, "item": "UNIT_SCOUT", "observed": True}
            with patch("civ7.actions.run_script", new_callable=AsyncMock,
                       side_effect=[{"status": "submitted", "before": before, "expected": expected},
                                    {**before, **expected}]):
                result = await create_server(enable_writes=True).call_tool(name, arguments)
            self.assertFalse(result.is_error)
            self.assertEqual(result.structured_content["status"], "verified_applied")
            for bad in ({"expected_turn": True}, {"x": True}, *([{"max_gold_cost": True}] if extra else [])):
                with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
                    with self.assertRaises(ToolError):
                        await create_server(enable_writes=True).call_tool(name, {**arguments, **bad})
                    run.assert_not_awaited()
