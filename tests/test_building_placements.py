import asyncio
from contextlib import asynccontextmanager, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from civ7.connection import run_script
from civ7 import queries
from sidkick.server import create_server


class PlacementToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_passes_required_settlement_and_optional_constructible_as_data(self) -> None:
        self.assertTrue(callable(getattr(queries, "building_placements", None)))
        data = {"turn": 96, "constructibles": []}
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value=data) as run:
            result = await queries.building_placements(' Lake "City" ', " BUILDING_BANK ")
        self.assertEqual(result, data)
        run.assert_awaited_once_with("building_placements.js", {
            "settlement": 'Lake "City"', "constructible": "BUILDING_BANK",
        })

    async def test_mcp_requires_settlement_and_returns_structured_data(self) -> None:
        server = create_server()
        tools = {tool.name: tool for tool in server._tool_manager.list_tools()}
        self.assertIn("get_civ7_building_placements", tools)
        schema = tools["get_civ7_building_placements"].parameters
        self.assertIn("settlement", schema["required"])
        data = {"turn": 96, "constructibles": []}
        with patch("civ7.queries.run_script", new_callable=AsyncMock, return_value=data) as run:
            result = await server.call_tool("get_civ7_building_placements", {"settlement": "City"})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content, data)
        run.assert_awaited_once_with("building_placements.js", {"settlement": "City", "constructible": None})

    async def test_rejects_blank_selectors_before_querying_game(self) -> None:
        self.assertTrue(callable(getattr(queries, "building_placements", None)))
        with patch("civ7.queries.run_script", new_callable=AsyncMock) as run:
            for settlement, constructible in ((" ", None), ("City", " ")):
                with self.subTest(settlement=settlement, constructible=constructible):
                    with self.assertRaises(ValueError):
                        await queries.building_placements(settlement, constructible)
            run.assert_not_awaited()


class QueryArgumentTests(unittest.IsolatedAsyncioTestCase):
    async def test_json_arguments_cannot_execute_javascript(self) -> None:
        if not shutil.which("node"):
            self.skipTest("Node.js is required for JavaScript encoding verification")
        arguments = {
            "settlement": '\"); globalThis.injected = true; //\n\u2028\u2029',
            "constructible": "'); globalThis.injected = true; //",
            "__proto__": {"injected": True},
        }
        with tempfile.TemporaryDirectory(dir="/tmp/opencode" if Path("/tmp/opencode").is_dir() else None) as temp:
            root = Path(temp)
            (root / "echo.js").write_text(
                "(() => ({received: queryArguments, injected: globalThis.injected === true}))()",
                encoding="utf-8",
            )
            reader = asyncio.StreamReader()
            payload = b'SIDKICK_RESULT:{"ok":true}\0'
            reader.feed_data(struct.pack("<II", len(payload), 3) + payload)
            writer = Mock(drain=AsyncMock(), wait_closed=AsyncMock())
            with patch("civ7.connection.ROOT", root), patch(
                "civ7.connection.asyncio.open_connection", new_callable=AsyncMock,
                return_value=(reader, writer),
            ) as connect:
                self.assertEqual(await run_script("echo.js", arguments), {"ok": True})
            connect.assert_awaited_once_with("127.0.0.1", 4318)
            writer.close.assert_called_once_with()
            frame = writer.write.call_args.args[0]
            javascript = frame[8:].decode().removeprefix("CMD:65535:").removesuffix("\0")
            result = subprocess.run(
                ["node", "-e", "const vm=require('node:vm');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>console.log(vm.runInNewContext(s)));"],
                input=javascript, text=True, capture_output=True, check=True, timeout=10,
            )
            decoded = json.loads(result.stdout.removeprefix("SIDKICK_RESULT:"))
            self.assertEqual(decoded["received"], arguments)
            self.assertFalse(decoded["injected"])

    async def test_unparameterized_queries_keep_working(self) -> None:
        reader = asyncio.StreamReader()
        payload = b'SIDKICK_RESULT:{"turn":96}\0'
        reader.feed_data(struct.pack("<II", len(payload), 3) + payload)
        writer = Mock(drain=AsyncMock(), wait_closed=AsyncMock())
        with patch("civ7.connection.asyncio.open_connection", new_callable=AsyncMock,
                   return_value=(reader, writer)):
            self.assertEqual(await run_script("empire.js"), {"turn": 96})

    async def test_parameters_do_not_bypass_bundled_script_restriction(self) -> None:
        with patch("civ7.connection.asyncio.open_connection", new_callable=AsyncMock) as connect:
            with self.assertRaises(ValueError):
                await run_script("../outside.js", {"settlement": "City"})
            connect.assert_not_awaited()


class LiveCheckTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_check_supplies_required_settlement_argument(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scripts/check-live-mcp.py"
        spec = importlib.util.spec_from_file_location("check_live_mcp", path)
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)

        @asynccontextmanager
        async def transport(parameters):
            yield None, None

        session = AsyncMock()
        session.__aenter__.return_value = session
        session.initialize.return_value = SimpleNamespace(
            server_info=SimpleNamespace(icons=[True]), protocol_version="test",
        )
        session.list_tools.return_value = SimpleNamespace(tools=[
            SimpleNamespace(name="get_civ7_building_placements"),
            SimpleNamespace(name="get_civ7_empire"),
        ])

        async def call_tool(name, arguments):
            if name == "get_civ7_building_placements":
                self.assertEqual(arguments, {"settlement": "City"})
            return SimpleNamespace(is_error=False, structured_content={"settlements": [{"name": "City"}]})

        session.call_tool.side_effect = call_tool
        with patch.object(check, "stdio_client", transport), patch.object(check, "ClientSession", return_value=session):
            with redirect_stdout(io.StringIO()):
                await check.main()
        session.call_tool.assert_any_await("get_civ7_building_placements", {"settlement": "City"})
