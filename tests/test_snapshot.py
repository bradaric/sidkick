import asyncio
from contextlib import ExitStack, asynccontextmanager, redirect_stdout
from copy import deepcopy
from io import StringIO
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from civ7 import player
from sidkick.server import create_server


STATE = {"turn": 140, "age": "AGE_EXPLORATION", "playerId": 0,
         "civilization": "CIVILIZATION_CHOLA", "leader": "LEADER_CATHERINE"}
CORE = {"turn": 140, "civilization": "Chola", "leader": "Catherine the Great",
        "age": "Exploration", "technology": "Tech", "civic": "Civic",
        "triumphs": [], "dedications": None, "settlements": [{"name": "Core fallback"}]}
READERS = (
    "empire", "settlements", "growth", "research_and_government", "religion",
    "resources_and_trade", "units", "known_world", "victory_progress", "available_decisions",
    "diplomacy", "city_states", "visible_threats", "turn_context", "age_transition", "explored_map",
)


class SnapshotTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, *, start=None, end=None, core=None):
        stack = ExitStack()
        self.addCleanup(stack.close)
        start = deepcopy(STATE) if start is None else start
        end = deepcopy(STATE) if end is None else end
        core = deepcopy(CORE) if core is None else core
        states = iter([start, end])

        async def script(name):
            value = next(states) if name == "snapshot_state.js" else core
            if isinstance(value, BaseException):
                raise value
            return value

        mocks = {"run_script": stack.enter_context(patch.object(player, "run_script", side_effect=script))}
        for reader in READERS:
            value = {"turn": 140, "evidence": reader}
            if reader == "settlements":
                value.update(settlements=[{"name": "Focused settlement"}], archivedGreatWorks=[])
            if reader == "units":
                value["units"] = [{"instanceId": 7}]
            mocks[reader] = stack.enter_context(patch.object(player, reader, new_callable=AsyncMock, return_value=value))
        return mocks

    async def test_complete_snapshot_keeps_shape_and_exposes_observed_consistency(self):
        mocks = self.fixture()
        data = await player.snapshot()
        self.assertIn("snapshotStatus", data)
        self.assertEqual(next(iter(data)), "snapshotStatus", "reliability status must be prominent")
        status = data["snapshotStatus"]
        self.assertEqual(status["status"], "complete")
        self.assertIs(status["complete"], True)
        self.assertIs(status["consistent"], True)
        self.assertEqual(status["start"], STATE)
        self.assertEqual(status["end"], STATE)
        self.assertEqual(status["errors"], {})
        self.assertEqual(len(status["domainTurns"]), 16)
        self.assertEqual(set(status["domainTurns"].values()), {140})
        self.assertEqual(data["settlements"], [{"name": "Focused settlement"}])
        self.assertEqual(data["units"], [{"instanceId": 7}])
        self.assertEqual(data["civilization"], "Chola")
        mocks["explored_map"].assert_not_awaited()
        self.assertEqual(mocks["run_script"].await_count, 3, "only boundary checks and core read")

    async def test_failed_domain_is_null_but_later_domains_and_errors_survive(self):
        mocks = self.fixture()
        mocks["growth"].side_effect = RuntimeError("Growth is unavailable")
        data = await player.snapshot()
        self.assertIsNone(data["growth"])
        self.assertEqual(data["ageTransition"]["evidence"], "age_transition")
        self.assertEqual(data["snapshotStatus"]["status"], "partial")
        self.assertFalse(data["snapshotStatus"]["complete"])
        self.assertEqual(data["snapshotStatus"]["errors"]["growth"],
                         {"type": "RuntimeError", "message": "Growth is unavailable"})
        mocks["growth"].assert_awaited_once_with()
        mocks["age_transition"].assert_awaited_once_with()

    async def test_failed_flattened_domains_do_not_reuse_core_fallbacks_or_empty_lists(self):
        mocks = self.fixture()
        mocks["settlements"].side_effect = TimeoutError("Timed out")
        mocks["units"].return_value = {"turn": 140, "units": None}
        data = await player.snapshot()
        self.assertIsNone(data["settlements"])
        self.assertIsNone(data["archivedGreatWorks"])
        self.assertIsNone(data["units"])
        self.assertIn("units", data["snapshotStatus"]["errors"])
        self.assertIsNotNone(data["empire"])

    async def test_core_failure_preserves_focused_data_without_inventing_identity(self):
        self.fixture(core=RuntimeError("Core read failed"))
        data = await player.snapshot()
        self.assertIsNone(data["civilization"])
        self.assertIsNone(data["turn"])
        self.assertEqual(data["settlements"], [{"name": "Focused settlement"}])
        self.assertIn("player", data["snapshotStatus"]["errors"])

    async def test_state_changes_and_intermediate_turns_are_inconsistent_without_retries(self):
        for field, value in [("turn", 141), ("age", "AGE_MODERN"), ("playerId", 1),
                             ("civilization", "CIVILIZATION_RUSSIA"), ("leader", "LEADER_OTHER")]:
            with self.subTest(field=field):
                end = {**STATE, field: value}
                mocks = self.fixture(end=end)
                data = await player.snapshot()
                self.assertEqual(data["snapshotStatus"]["status"], "inconsistent")
                self.assertFalse(data["snapshotStatus"]["consistent"])
                self.assertEqual(data["snapshotStatus"]["end"][field], value)
                mocks["growth"].assert_awaited_once_with()
        mocks = self.fixture()
        mocks["growth"].return_value = {"turn": 141}
        data = await player.snapshot()
        self.assertEqual(data["snapshotStatus"]["status"], "inconsistent")
        self.assertEqual(data["snapshotStatus"]["domainTurns"]["growth"], 141)
        self.assertEqual(data["growth"], {"turn": 141}, "mixed data is retained but labelled")

    async def test_missing_state_or_turn_evidence_is_not_claimed_consistent(self):
        for state in [RuntimeError("No loaded player"), {"turn": 140}]:
            with self.subTest(state=state):
                self.fixture(start=state)
                data = await player.snapshot()
                self.assertIsNone(data["snapshotStatus"]["consistent"])
                self.assertIn("start", data["snapshotStatus"]["errors"])
                self.assertNotEqual(data["snapshotStatus"]["status"], "complete")
        mocks = self.fixture()
        mocks["growth"].return_value = {"turn": True}
        data = await player.snapshot()
        self.assertIsNone(data["snapshotStatus"]["consistent"])
        self.assertIsNone(data["snapshotStatus"]["domainTurns"]["growth"])
        self.assertEqual(data["snapshotStatus"]["status"], "unverified")

    async def test_collection_cancellation_is_not_converted_to_partial_success(self):
        mocks = self.fixture()
        mocks["growth"].side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await player.snapshot()
        mocks["age_transition"].assert_not_awaited()

    async def test_unavailable_connection_returns_explicit_nulls_and_errors(self):
        mocks = self.fixture(start=ConnectionRefusedError("Offline"), end=ConnectionRefusedError("Offline"),
                             core=ConnectionRefusedError("Offline"))
        for name in READERS:
            mocks[name].side_effect = ConnectionRefusedError("Offline")
        data = await player.snapshot()
        self.assertEqual(data["snapshotStatus"]["status"], "partial")
        self.assertIsNone(data["snapshotStatus"]["consistent"])
        self.assertEqual(len(data["snapshotStatus"]["errors"]), 18)
        self.assertTrue(all(value is None for key, value in data.items() if key != "snapshotStatus"))

    async def test_full_snapshot_includes_map_in_the_same_consistency_boundary(self):
        mocks = self.fixture()
        mocks["explored_map"].return_value = {"turn": 141, "plots": []}
        data = await player.full_snapshot()
        self.assertEqual(data["exploredMap"], {"turn": 141, "plots": []})
        self.assertEqual(data["snapshotStatus"]["status"], "inconsistent")
        self.assertEqual(data["snapshotStatus"]["domainTurns"]["exploredMap"], 141)
        self.assertEqual(mocks["run_script"].await_args_list[-1].args, ("snapshot_state.js",))

    async def test_map_failure_is_partial_and_cannot_be_exported(self):
        mocks = self.fixture()
        mocks["explored_map"].side_effect = RuntimeError("Map read failed")
        data = await player.full_snapshot()
        self.assertIsNone(data["exploredMap"])
        self.assertIn("exploredMap", data["snapshotStatus"]["errors"])
        with self.assertRaises(SystemExit):
            player.export_path(data)

    async def test_mcp_partial_response_has_status_and_surviving_domains(self):
        mocks = self.fixture()
        mocks["growth"].side_effect = RuntimeError("Growth is unavailable")
        result = await create_server().call_tool("get_civ7_player_snapshot", {})
        self.assertFalse(result.is_error, "partial tool result is structured data, not an all-or-nothing MCP error")
        self.assertEqual(result.structured_content["snapshotStatus"]["status"], "partial")
        self.assertIsNone(result.structured_content["growth"])
        self.assertIsNotNone(result.structured_content["ageTransition"])


class ExportSafetyTests(unittest.TestCase):
    def test_export_gate_rejects_missing_partial_inconsistent_or_unknown_status(self):
        with TemporaryDirectory(prefix="sidkick-export-") as directory, patch.object(player, "ROOT", Path(directory)):
            existing = Path(directory) / "save-2-chola.json"
            existing.write_text("preserve existing export", encoding="utf-8")
            for status in [None, ["invalid"], {"status": "complete", "complete": False, "consistent": True},
                           {"status": "complete", "complete": True, "consistent": None},
                           {"status": "partial", "complete": False, "consistent": True},
                           {"status": "inconsistent", "complete": True, "consistent": False},
                           {"status": "unverified", "complete": True, "consistent": None}]:
                with self.subTest(status=status):
                    data = {**CORE, "snapshotStatus": status}
                    with self.assertRaisesRegex(SystemExit, "No export written"):
                        player.export_path(data)
                    self.assertEqual(existing.read_text(encoding="utf-8"), "preserve existing export")
                    self.assertEqual(list(Path(directory).iterdir()), [existing])

    def test_complete_consistent_export_keeps_existing_filename_rules(self):
        data = {**CORE, "snapshotStatus": {"status": "complete", "complete": True, "consistent": True}}
        self.assertEqual(player.export_path(data), player.ROOT / "save-2-chola.json")
        with self.assertRaisesRegex(SystemExit, "Unrecognized"):
            player.export_path({**data, "age": "Modern"})


class LiveCheckTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_smoke_check_requires_a_complete_verified_snapshot(self):
        main = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/check-live-mcp.py"))["main"]
        session = SimpleNamespace(
            initialize=AsyncMock(return_value=SimpleNamespace(server_info=SimpleNamespace(icons=["icon"]), protocol_version="test")),
            list_tools=AsyncMock(return_value=SimpleNamespace(tools=[SimpleNamespace(name="get_civ7_player_snapshot")])),
            call_tool=AsyncMock(),
        )

        @asynccontextmanager
        async def stdio(_):
            yield None, None

        @asynccontextmanager
        async def client(*_):
            yield session

        with patch.dict(main.__globals__, stdio_client=stdio, ClientSession=client):
            for status in [None, {"status": "partial", "complete": False, "consistent": True},
                           {"status": "inconsistent", "complete": True, "consistent": False},
                           {"status": "unverified", "complete": True, "consistent": None}]:
                with self.subTest(status=status):
                    session.call_tool.return_value = SimpleNamespace(is_error=False, structured_content={"snapshotStatus": status})
                    with self.assertRaisesRegex(RuntimeError, "snapshot"):
                        await main()
            session.call_tool.return_value = SimpleNamespace(is_error=False, structured_content={
                "snapshotStatus": {"status": "complete", "complete": True, "consistent": True},
            })
            with redirect_stdout(StringIO()) as output:
                await main()
            self.assertIn("1 tools discovered and called successfully", output.getvalue())


if __name__ == "__main__":
    unittest.main()
