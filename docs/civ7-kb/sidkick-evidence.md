# Sidkick: evidence collection and uncertainty

Evidence: **REPO** [README](../../README.md), [coverage audit](../civ7-coverage-audit.md), [victory query](../../civ7/victory.js), plus this session's **OBSERVED** contradictions. These notes do not extend the actual tool capabilities.

## Use focused queries

| Question | Focused tool(s) | Important checks |
|---|---|---|
| Can we survive/win in time? | `get_civ7_victory_progress` | `victoryAlerts`, native target/countdown/prerequisites, campaign-specific schedule, scoring ledger, project checks |
| What technology/civic/card? | `get_civ7_research_and_government` | Active versus available; depth; unlocks; slot type; current perk text; pending government/celebration state |
| What can this city build/buy? | `get_civ7_available_decisions` | Queue elsewhere, availability, price, affordability, repair flag, project list |
| Where should it go? | `get_civ7_building_placements` + `get_civ7_settlements` | Exact city/constructible; net yields; all displaced assets; unique improvements; district contents |
| Specialist or expansion? | `get_civ7_growth` | Pending population; legal options; specialist-specific upkeep; separate improvement previews |
| Town specialization? | Decisions + settlements | Count existing qualifying tiles; connection recipients; focus stops growth; no marginal focus simulation |
| Resource/rail/Factory? | `get_civ7_resources_and_trade` | Eligibility, capacity, instance/origin, network membership, Factory production state; unknown marginal deltas |
| City-state choice/incorporation? | `get_civ7_city_states` + empire | Pending bonus, selected effect, count-based requirements, Influence and settlement reserve |
| A reward/disaster/blocked turn? | `get_civ7_turn_context` | Pending events and rewards; notifications; damage inventory; movement/path from UI as needed |
| Explorer/unit position? | `get_civ7_units`, then `get_civ7_movement_and_founding` | Numeric `instanceId`; movement; revealed position/path; no general archaeology action checker |
| War feasibility? | Units, diplomacy, visible threats, targeted combat | Visibility/legal action, not inferred damage or unseen forces |

Tool discovery is host-specific. If a refreshed catalog omits a tool, discover its current signature; do not fabricate a name or call through arbitrary string paths. No call here authorizes executing game actions.

Filter returned payloads to the few fields needed for the question. Avoid routinely returning entire diplomacy/resource/settlement payloads: the original conversation repeatedly truncated important results. Keep turn/Age and uncertainty context when filtering.

## Snapshot consistency

Read `snapshotStatus` first. A successful call may be `partial`, `inconsistent` or `unverified`. Failed domains are unknown, not empty/zero. Even a complete observed-consistent snapshot is **non-atomic**: same-turn actions or loading a save with matching markers can still make combined advice stale.

Focused parallel calls should likewise have their domain turns compared. Re-query the minimum if the user advanced or changed the relevant queue after a read. Never equate "recommended", "available", "inQueue" and "completed".

## New victory support: use it, don't duplicate it

At baseline `a78cfda`, victory output gained:

- `dominanceSchedule`: campaign/previous-Age-matched rule tiers and current/next threshold.
- `victoryAlerts`: active met-rival countdowns and upcoming easing.
- `scoringRules`: public conditional scoring definitions/arguments, **not** a guarantee each source is locally active.
- Native target preservation and nulls for unknown countdown data.

The implementation was source/fixture verified; its README said live verification of the new fields was pending while the game was closed. **This KB did not reopen the game or live-test that change.** The historical T56 target/countdown observations predate the new field support.

Use these fields rather than baking a schedule calculator into another agent or pretending the old target stays constant. Native target/countdown remains authoritative; the met-player subset must not be used to overwrite a global target that can depend on unmet players.

## Known traps from this campaign

1. **Null displaced constructible:** an Obshchina could be present even when a placement reported `overbuilds: null`. Cross-check district/improvement inventory and UI.
2. **One displaced object versus whole tile:** a Rail Station over Inn/Guildhall may remove both. A single named overbuild is not complete loss accounting.
3. **Cross-settlement preview yields:** the engine's building delta can include effects beyond that building's city. Do not relabel +11 preview science as an intrinsic Aerodrome yield.
4. **Growth previews versus legal expansion:** special improvement previews can exist even when no population placement is ready. Empty legal options outside a growth event do not prove no future resources exist.
5. **Improvement placement API mismatch:** `get_civ7_building_placements` errored for Obshchina earlier; `get_civ7_growth().settlements[].expansion.previews` supplied its useful previews.
6. **Queues lack selected tile coordinates:** the StP Obshchina queue showed two turns but not its chosen hex. After completion, settlement improvements exposed its location. Do not invent a queued placement.
7. **Native operation permission versus active chooser:** government selection could report success when no switch was offered. Use conservative pending-selection fields; never send requests to test it.
8. **No archaeology disabled reason:** the available-decisions tool did not expose an Explorer excavation action check. Movement remaining alone could not explain the grey shovel. Ask for the actual action tooltip.
9. **No neutral-settler forecast:** visible-threat queries expose visible hostile units, not a neutral American Settler's intended founding site. No hidden orders can be inferred.
10. **No arbitrary founding simulation:** current/adjacent Settler checks do not certify a distant proposed site. Migrants do not found towns or fill arbitrary gaps outside all settlement radii.
11. **No full combat forecast:** contextual strength, expected damage and result can be null. Do not sum whitelisted modifiers and claim likely damage; a commander's distinct command eligibility is not the same as individual attack permission.
12. **UI mod advice is not a requirement:** Info+ priority/ACT NOW/high-confidence labels were advisory and sometimes misleading. Ideology entry research remained blocked despite an urgent-looking label.

## Communication protocol

When evidence conflicts, name both readings and what each supports. Example:

> The placement record calls this empty, but the settlement inventory contains an Obshchina there. I would preserve it and use the other legal tile unless your UI explicitly shows the intended replacement.

For a grey action:

> Your unit has movement, so exhaustion is not established. I need the tooltip on the command itself; the tile's generic description does not identify the blocker.

For prices:

> That was the pre-selection quote. The current UI shows 800; use the current quote and recheck the reserve.

For unavailable new fields:

> This connection is not returning dominanceSchedule. The published default changes at Age-progress milestones, but I cannot certify the loaded campaign's next tier from this response.

Keep explanations concise during play. Put deeper evidence in the handoff/KB instead of burying the recommendation in a full raw export.
