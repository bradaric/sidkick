import unittest
from unittest.mock import AsyncMock, patch

from mcp.server.mcpserver.exceptions import ToolError

from civ7 import actions
from sidkick.server import create_server


BEFORE = {"turn": 58, "age": 42, "playerId": 0, "activePolicies": ["POLICY_A"],
          "activeTraditions": ["TRADITION_A"], "activeCrises": []}
EXPECTED = {"activePolicies": [], "activeTraditions": ["TRADITION_A"], "activeCrises": []}
AFTER = {**BEFORE, **EXPECTED}
SUBMITTED = {"status": "submitted", "policy": "POLICY_A", "active": False,
             "before": BEFORE, "expected": EXPECTED}


class PolicyActionTests(unittest.IsolatedAsyncioTestCase):
    async def test_policy_toggle_submits_once_and_verifies_all_slot_groups(self):
        self.assertTrue(callable(getattr(actions, "set_policy_active", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[SUBMITTED, BEFORE, AFTER]) as run, patch(
                       "civ7.actions.asyncio.sleep", new_callable=AsyncMock):
            result = await actions.set_policy_active(" POLICY_A ", False, 58)
        self.assertEqual(result["status"], "verified_applied")
        self.assertEqual(result["after"], AFTER)
        self.assertEqual(run.await_args_list[0].args, ("set_policy_active.js", {
            "policy": "POLICY_A", "active": False, "expected_turn": 58,
        }))
        self.assertEqual([call.args[0] for call in run.await_args_list],
                         ["set_policy_active.js", "policy_state.js", "policy_state.js"])

    async def test_policy_inputs_do_not_coerce_activation_or_turn_values(self):
        self.assertTrue(callable(getattr(actions, "set_policy_active", None)))
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            for policy, active, turn in [(" ", False, 58), (1, False, 58),
                                         ("POLICY_A", 1, 58), ("POLICY_A", "false", 58),
                                         ("POLICY_A", False, True)]:
                with self.assertRaises(ValueError):
                    await actions.set_policy_active(policy, active, turn)
            run.assert_not_awaited()

    async def test_policy_rejection_and_noops_never_read_or_submit_again(self):
        self.assertTrue(callable(getattr(actions, "set_policy_active", None)))
        for status in ("rejected", "already_active", "already_inactive"):
            data = {"status": status, "policy": "POLICY_A", "active": False}
            with patch("civ7.actions.run_script", new_callable=AsyncMock, return_value=data) as run:
                self.assertEqual(await actions.set_policy_active("POLICY_A", False, 58), data)
                self.assertEqual(run.await_count, 1)

    async def test_unexpected_changes_to_other_slot_groups_cannot_verify_a_toggle(self):
        self.assertTrue(callable(getattr(actions, "set_policy_active", None)))
        async def response(script, *args):
            return SUBMITTED if script == "set_policy_active.js" else {**AFTER, "activeTraditions": []}
        with patch("civ7.actions.run_script", side_effect=response), patch(
                "civ7.actions._VERIFICATION_TIMEOUT", 0.02):
            result = await actions.set_policy_active("POLICY_A", False, 58)
        self.assertEqual(result["status"], "unknown")

    async def test_policy_tool_is_opt_in_structured_and_strictly_typed(self):
        normal = {tool.name for tool in create_server()._tool_manager.list_tools()}
        tools = {tool.name: tool for tool in create_server(enable_writes=True)._tool_manager.list_tools()}
        self.assertNotIn("set_civ7_policy_active", normal)
        self.assertIn("set_civ7_policy_active", set(tools))
        tool = tools["set_civ7_policy_active"]
        self.assertEqual(set(tool.parameters["required"]), {"policy", "active", "expected_turn"})
        self.assertFalse(tool.annotations.read_only_hint)
        self.assertTrue(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.idempotent_hint)
        with patch("civ7.actions.run_script", new_callable=AsyncMock, side_effect=[SUBMITTED, AFTER]):
            result = await create_server(enable_writes=True).call_tool("set_civ7_policy_active", {
                "policy": "POLICY_A", "active": False, "expected_turn": 58,
            })
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "verified_applied")
        with patch("civ7.actions.run_script", new_callable=AsyncMock) as run:
            with self.assertRaises(ToolError):
                await create_server(enable_writes=True).call_tool("set_civ7_policy_active", {
                    "policy": "POLICY_A", "active": 1, "expected_turn": 58,
                })
            run.assert_not_awaited()
