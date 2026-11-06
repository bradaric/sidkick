import asyncio
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from civ7 import actions, connection, queries
from sidkick.server import create_server


class ActionReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def serialized_result(self, context, *, guarded=True, reader=False):
        self.assertTrue(callable(getattr(connection, "run_started_script", None)))
        if not shutil.which("node"):
            self.skipTest("Node.js is required to execute the actual transport envelope")
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as temp:
            root = Path(temp)
            name = "echo.js" if reader else "attack_unit.js"
            (root / name).write_text(
                "(() => ({read:true,args:queryArguments}))()" if reader else
                "(() => {Game.PlayerOperations.sendRequest(0,900,queryArguments);return{status:'submitted',args:queryArguments};})()"
            )
            (root / "combat_observation.js").write_text(
                "(() => {globalThis.helperRuns=(globalThis.helperRuns??0)+1;return{};})()"
            )
            stream = asyncio.StreamReader()
            payload = b'SIDKICK_RESULT:{"stubbed":true}\0'
            stream.feed_data(struct.pack("<II", len(payload), 3) + payload)
            writer = Mock(drain=AsyncMock(), wait_closed=AsyncMock())
            with patch("civ7.connection.ROOT", root), patch(
                "civ7.connection.asyncio.open_connection", new_callable=AsyncMock,
                return_value=(stream, writer),
            ) as connect:
                run = connection.run_started_script if guarded else connection.run_script
                await run(name, {"unit_id": 20})
            connect.assert_awaited_once_with("127.0.0.1", 4318)
            self.assertEqual(writer.write.call_count, 1, "guard must add no extra request")
            javascript = writer.write.call_args.args[0][8:].decode().removeprefix("CMD:65535:").removesuffix("\0")
            runner = """
const vm=require('node:vm');let input='';process.stdin.on('data',c=>input+=c);
process.stdin.on('end',()=>{const x=JSON.parse(input),ctx={...x.context};
if(ctx.UI){const settings=ctx.UI;ctx.UI={isInGame:()=>settings.inGame};
if(settings.state!==null)ctx.UI.getGameLoadingState=()=>settings.state;}
ctx.Game={PlayerOperations:{sendRequest:()=>{ctx.submissions=(ctx.submissions??0)+1;}}};
const raw=vm.runInNewContext(x.script,ctx);
console.log(JSON.stringify({result:JSON.parse(raw.replace(/^SIDKICK_RESULT:/,'')),submissions:ctx.submissions??0,helperRuns:ctx.helperRuns??0}));});
"""
            result = subprocess.run(
                ["node", "-e", runner], input=json.dumps({"script": javascript, "context": context}),
                text=True, capture_output=True, check=True, timeout=10,
            )
            return json.loads(result.stdout)

    async def test_all_mcp_writers_use_guarded_transport_but_queries_do_not(self):
        self.assertTrue(callable(getattr(connection, "run_started_script", None)))
        self.assertIs(actions.run_script, connection.run_started_script)
        self.assertIs(queries.run_script, connection.run_script)
        writers = [t for t in create_server(enable_writes=True)._tool_manager.list_tools()
                   if t.annotations.read_only_hint is False]
        self.assertTrue(writers)
        self.assertEqual({t.fn.__module__ for t in writers}, {actions.__name__})

    async def test_loading_or_unknown_readiness_rejects_before_helper_and_native_submission(self):
        for context in (
            {}, {"UI": {"inGame": False, "state": 8}, "UIGameLoadingState": {"GameStarted": 8}},
            {"UI": {"inGame": True, "state": 6}, "UIGameLoadingState": {"GameStarted": 8}},
            {"UI": {"inGame": True, "state": None}, "UIGameLoadingState": {"GameStarted": 8}},
            {"UI": {"inGame": True, "state": 8}},
        ):
            with self.subTest(context=context):
                r = await self.serialized_result(context)
                self.assertEqual(r["result"]["status"], "rejected")
                self.assertEqual(r["submissions"], 0)
                self.assertEqual(r["helperRuns"], 0)

    async def test_started_actions_submit_once_and_read_only_transport_still_works_without_loading_api(self):
        r = await self.serialized_result({"UI": {"inGame": True, "state": 8}, "UIGameLoadingState": {"GameStarted": 8}})
        self.assertEqual(r["result"], {"status": "submitted", "args": {"unit_id": 20}})
        self.assertEqual(r["submissions"], 1)
        self.assertEqual(r["helperRuns"], 1)
        r = await self.serialized_result({}, guarded=False, reader=True)
        self.assertEqual(r["result"], {"read": True, "args": {"unit_id": 20}})

    async def test_guarded_transport_keeps_bundled_path_restriction(self):
        self.assertTrue(callable(getattr(connection, "run_started_script", None)))
        with patch("civ7.connection.asyncio.open_connection", new_callable=AsyncMock) as connect:
            with self.assertRaises(ValueError):
                await connection.run_started_script("../outside.js", {})
            connect.assert_not_awaited()

    async def test_loading_during_readback_stays_unknown_without_resubmitting(self):
        submitted = {"status": "submitted", "before": {"turn": 1, "age": 42, "playerId": 0},
                     "expected": {"done": True}}
        rejected = {"status": "rejected", "reason": "Native GameStarted readiness is required"}
        with patch("civ7.actions.run_script", new_callable=AsyncMock,
                   side_effect=[submitted, rejected]) as run:
            r = await actions._execute_and_verify("fixed_action.js", {}, "fixed_state.js")
        self.assertEqual(r["status"], "unknown")
        self.assertEqual(r["after"], rejected)
        self.assertEqual([call.args[0] for call in run.await_args_list],
                         ["fixed_action.js", "fixed_state.js"])
