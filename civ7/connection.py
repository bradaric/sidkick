"""Local FireTuner transport for fixed bundled Civ VII scripts."""

import asyncio
from contextlib import suppress
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "FiretunerTerminal"))

from civ7_terminal.connection import _wrap_js
from civ7_terminal.protocol import decode_header, encode_command


async def run_script(
    script_name: str, arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a bundled script once, optionally binding JSON queryArguments."""
    return await _run_script(script_name, arguments, require_started=False)


async def run_started_script(
    script_name: str, arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Action transport: reject transitional loading before evaluating any bundled code."""
    return await _run_script(script_name, arguments, require_started=True)


async def run_load_game_script(arguments: dict[str, Any]) -> dict[str, Any]:
    """Only this fixed loader may run from the menu; its bundled guard rejects transitions/MP."""
    return await _run_script("save_load.js", {**arguments, "operation": "load"}, require_started=False)


async def _run_script(
    script_name: str, arguments: dict[str, Any] | None, *, require_started: bool,
) -> dict[str, Any]:
    script_path = (ROOT / script_name).resolve()
    if script_path.parent != ROOT or script_path.suffix != ".js":
        raise ValueError("Civ VII queries must be bundled JavaScript files")

    script = script_path.read_text(encoding="utf-8")
    if script_name in {"end_turn.js", "turn_state.js", "turn_context.js"}:
        helper = (ROOT / "remaining_moves.js").read_text(encoding="utf-8")
        script = f"((remainingMoves) => {{ return {script}\n}})({helper})"
    if script_name in {"attack_unit.js", "unit_attack_state.js", "army_attack.js", "air_attack_unit.js", "air_attack_state.js", "group_air_attack.js", "group_air_attack_state.js", "ranged_district_attack.js", "district_attack_state.js", "commander_attack.js", "assault_city.js", "city_assault_state.js"}:
        # Fixed internal prelude, never caller-selected or arbitrary JavaScript.
        helper = (ROOT / "combat_observation.js").read_text(encoding="utf-8")
        script = f"((combatObserver) => {{ return {script}\n}})({helper})"
    if script_name in {"peace_city_offer.js", "peace_city_action.js", "peace_city_state.js"}:
        helper = (ROOT / "peace_city_terms.js").read_text(encoding="utf-8")
        script = f"((peaceCityTerms) => {{ return {script}\n}})({helper})"
    if script_name in {"diplomacy.js", "respond_first_meet.js", "first_meet_state.js"}:
        helper = (ROOT / "first_meet.js").read_text(encoding="utf-8")
        script = f"((firstMeet) => {{ return {script}\n}})({helper})"
    if script_name in {"turn_context.js", "acknowledge_espionage_report.js", "espionage_report_state.js"}:
        helper = (ROOT / "espionage_report_observation.js").read_text(encoding="utf-8")
        script = f"((espionageReport) => {{ return {script}\n}})({helper})"
    if script_name in {"turn_context.js", "close_triumph_popup.js", "triumph_popup_state.js"}:
        helper = (ROOT / "triumph_popup.js").read_text(encoding="utf-8")
        script = f"((triumphPopup) => {{ return {script}\n}})({helper})"
    if script_name in {"age_transition.js", "edit_dedication.js", "dedication_state.js"}:
        helper = (ROOT / "dedication_deck.js").read_text(encoding="utf-8")
        script = f"((dedicationDeck) => {{ return {script}\n}})({helper})"
    if arguments is not None:
        # Parse data rather than interpolating selectors as executable JavaScript.
        encoded = json.dumps(json.dumps(arguments, allow_nan=False))
        script = f"((queryArguments) => {{ return {script}\n}})(JSON.parse({encoded}))"
    if require_started:
        # Outermost guard: helpers and action/readback bodies must not run behind Begin.
        script = (
            "(() => { if (typeof UI === 'undefined' || typeof UI.isInGame !== 'function' || "
            "UI.isInGame() !== true || typeof UI.getGameLoadingState !== 'function' || "
            "typeof UIGameLoadingState === 'undefined' || UIGameLoadingState === null || "
            "!Number.isInteger(UIGameLoadingState.GameStarted) || "
            "UI.getGameLoadingState() !== UIGameLoadingState.GameStarted) "
            "return {status:'rejected',reason:'Finish loading and click Begin first; "
            "native GameStarted readiness is required'}; return "
            f"{script}\n}})()"
        )

    marker = "SIDKICK_RESULT:"
    async with asyncio.timeout(12):
        reader, writer = await asyncio.open_connection("127.0.0.1", 4318)
        try:
            writer.write(encode_command(_wrap_js(script, marker)))
            await writer.drain()
            while True:
                length, _ = decode_header(await reader.readexactly(8))
                if length > 8_000_000:
                    raise ValueError("Oversized FireTuner response")
                frame = await reader.readexactly(length)
                if frame.startswith(marker.encode()):
                    body = frame[len(marker):].rstrip(b"\0").decode()
                    if not body.startswith("{"):
                        raise RuntimeError(body)
                    result = json.loads(body)
                    if not isinstance(result, dict):
                        raise TypeError("Civ VII query did not return an object")
                    return result
        finally:
            writer.close()
            with suppress(ConnectionError, OSError):
                await writer.wait_closed()
