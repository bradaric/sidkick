# Sidkick: evidence collection and uncertainty

Use the current [tool contracts](../../README.md) and live output. These notes explain how to interpret evidence; they do not extend the tools' capabilities.

## Use focused queries

| Question | Focused tool(s) | Important checks |
|---|---|---|
| Can we survive/win in time? | `get_civ7_victory_progress` | `victoryAlerts`, native target/countdown/prerequisites, campaign-specific schedule, scoring ledger, project checks |
| Which leader/persona and abilities apply? | `get_civ7_empire.identity` | Exact current identities, Age-filtered definitions and linked requirement-set IDs; not evaluated activation or numerical contribution |
| What technology/civic/card? | `get_civ7_research_and_government` | Active versus available; depth; unlocks; slot type; current perk text; pending government/celebration state |
| What can this city build/buy? | `get_civ7_available_decisions` | Queue elsewhere, availability, price, affordability, repair flag, project list |
| Where should it go? | `get_civ7_building_placements` + `get_civ7_settlements` | Exact city/constructible; net yields; all displaced assets; unique improvements; district contents |
| Specialist or expansion? | `get_civ7_growth` | Pending population; legal options; specialist-specific upkeep; separate improvement previews |
| Town specialization? | Decisions + settlements | Count existing qualifying tiles; connection recipients; focus stops growth; no marginal focus simulation |
| Resource/rail/Factory? | `get_civ7_resources_and_trade` | Eligibility, capacity, instance/origin, network membership, Factory production state; unknown marginal deltas |
| City-state choice/incorporation? | `get_civ7_city_states` + empire | Pending bonus, selected effect, count-based requirements, Influence and settlement reserve |
| Diplomatic terms, timing or secondary choices? | `get_civ7_diplomacy` | Native progress/stage/response evidence; partial checked choices, not guaranteed expiry dates or complete costs |
| A reward/disaster/blocked turn? | `get_civ7_turn_context` | Pending events and rewards; notifications; damage inventory; movement/path from UI as needed |
| Which Great Works do we own or can relocate? | `get_civ7_great_works`, then the same tool with `great_work_index` | Owned displayed/archive inventory and stable instance indices; capacity/damage; native plus picker eligibility; no marginal yields, swaps or archive actions |
| Can a religious unit spread now? | `get_civ7_religion.religiousUnits` | Owned current non-target readiness and charge quotes; packed units excluded from deployed checks; no arbitrary-target or conversion forecast |
| Archaeology readiness/countdown? | `get_civ7_archaeology`, then turn context/Great Works for rewards | Read excavation `failureReasons` even when unavailable: a native completion quote can indicate a running dig; no exported active-order or structured countdown fields |
| Explorer/unit position? | `get_civ7_units`, then `get_civ7_movement_and_founding` | Numeric `instanceId`; movement; revealed position/path; movement alone does not establish excavation activity |
| War feasibility? | Units, diplomacy, visible threats, targeted combat | Visibility/legal action, not inferred damage or unseen forces |

Tool discovery is host-specific. If a refreshed catalog omits a tool, discover its current signature; do not fabricate a name or call through arbitrary string paths. No call here authorizes executing game actions.

Filter returned payloads to the few fields needed for the question so important results are not truncated. Keep turn/Age and uncertainty context when filtering.

## Snapshot consistency

Read `snapshotStatus` first. A successful call may be `partial`, `inconsistent` or `unverified`. Failed domains are unknown, not empty/zero. Even a complete observed-consistent snapshot is **non-atomic**: same-turn actions or loading a save with matching markers can still make combined advice stale.

Focused parallel calls should likewise have their domain turns compared. Re-query the minimum if the user advanced or changed the relevant queue after a read. Never equate "recommended", "available", "inQueue" and "completed".

## Victory deadlines and scoring

Read the loaded campaign's victory output:

- `dominanceSchedule`: campaign/previous-Age-matched rule tiers and current/next threshold.
- `victoryAlerts`: active met-rival countdowns and upcoming easing.
- `scoringRules`: public conditional scoring definitions/arguments, **not** a guarantee each source is locally active.
- Native target preservation and nulls for unknown countdown data.

Use these fields rather than baking a schedule calculator into another agent or pretending the old target stays constant. Native target/countdown remains authoritative; the met-player subset must not be used to overwrite a global target that can depend on unmet players.

## Leader/civilization context

`get_civ7_empire.identity` adds the exact current leader/persona and civilization, current-Age or Age-independent ability/unique-item definitions, linked traits and modifier descriptions. `ownerRequirementSet` and `subjectRequirementSet` identify conditions; they do not report those conditions as satisfied. `appliedYieldContribution` remains null. Missing catalogs remain unknown.

Use this context before attributing a yield, slot bonus or unique item to the current leader/civilization. `previousCivilization` is reported separately; it does not establish retained abilities. Public unique-item definitions are not build/train eligibility checks. Memento descriptions and numerical swap effects still need separate evidence.

## Great Work inventory and relocation

1. Call `get_civ7_great_works` without a selector. It returns owned displayed and archived `works`, stable `works[].instanceIndex`, and `buildings` with capacity, use/free space, damage and `currentGreatWorkYields`. No relocation matrix is requested on this inventory-only call.
2. Select an owned `instanceIndex` from that response and pass it as `great_work_index` to the same tool. Do not use a work type ID, building component ID, unit `instanceId` or an invented numeric index.
3. Inspect `selectedWork` and `destinations`. `operationAllowed` is native permission; `pickerEligible` also requires empty capacity, an undamaged destination, an undamaged displayed source (or an archived source), and a different destination. Use `availableNow` for the combined result and inspect failure reasons/flags when blocked.

`currentGreatWorkYields` are **current whole-building totals across its works**, not the selected work's contribution. Comparing two buildings' totals does not simulate moving a work. `netYieldChange` remains null. Occupied-slot swaps and archive actions are unsupported; reading archived inventory is not an archive-action check. Foreign, ambiguous and invalid indices are rejected.

This is a separate focused query, **not included in snapshots**. Snapshot settlement inventories are not a substitute for selected-work relocation checks. Do not send a move request to test eligibility.

## Religious-unit readiness

`get_civ7_religion.religiousUnits` includes owned units with positive definition spread charges, their native **current non-target** spread readiness, failure reasons and charge quotes. Preserve `chargesRemaining: 0`; null means missing evidence, not zero. Packed units are not checked as deployed missionaries. `targetConversionPreview` remains null.

This does not check an arbitrary missionary destination, forecast population conversion, or validate every custom spread ability. Use it to distinguish current readiness from an unknown target-specific outcome; do not issue spread actions or treat another unit's base charges as this unit's remaining charges.

## Major-player diplomacy detail

- Read `terms`, native timing quotes, active-stage effects and support/response state. These are not guaranteed agreement expiry dates or evaluated yield contributions.
- `completion.progress` is native progress, not an estimate derived from duration. Preserve unknowns and genuine zeroes; do not invent missing progress or future expiry.
- `secondaryTargets` is a partial list of checked choices. Inspect each choice's `availableNow` and `failureReasons`, plus primary eligibility. It covers met/local players, owned settlements, public unit types and offered amounts—not every possible target. An empty list does not prove no other target exists.
- Do not add primary and secondary influence quotes into a guessed total. A missing total cost remains unknown.
- Hidden/espionage events are not attributed to a leader. Enacted peace-deal item terms and working-deal negotiation are unsupported. A successful read-only check is not permission to perform an action.

## Known traps from this campaign

1. **Null displaced constructible:** an Obshchina could be present even when a placement reported `overbuilds: null`. Cross-check district/improvement inventory and UI.
2. **One displaced object versus whole tile:** a Rail Station over Inn/Guildhall may remove both. A single named overbuild is not complete loss accounting.
3. **Cross-settlement preview yields:** the engine's building delta can include effects beyond that building's city. Do not relabel +11 preview science as an intrinsic Aerodrome yield.
4. **Growth previews versus legal expansion:** special improvement previews can exist even when no population placement is ready. Empty legal options outside a growth event do not prove no future resources exist.
5. **Improvement placement API mismatch:** `get_civ7_building_placements` errored for Obshchina earlier; `get_civ7_growth().settlements[].expansion.previews` supplied its useful previews.
6. **Queues lack selected tile coordinates:** the StP Obshchina queue showed two turns but not its chosen hex. After completion, settlement improvements exposed its location. Do not invent a queued placement.
7. **Native operation permission versus active chooser:** government selection could report success when no switch was offered. Use conservative pending-selection fields; never send requests to test it.
8. **Excavation readiness versus activity:** an unavailable excavation may already be running. Read `get_civ7_archaeology`'s `failureReasons` for a completion message. Empty reasons, a disappearing button or no visible timer do not prove failure; without an explanation, activity remains unknown. Active-order/queue fields and a structured countdown are not exposed. Verify rewards separately; an existing artifact does not prove a new dig succeeded.
9. **No neutral-settler forecast:** visible-threat queries expose visible hostile units, not a neutral American Settler's intended founding site. No hidden orders can be inferred.
10. **No arbitrary founding simulation:** current/adjacent Settler checks do not certify a distant proposed site. Migrants do not found towns or fill arbitrary gaps outside all settlement radii.
11. **No full combat forecast:** contextual strength, expected damage and result can be null. Do not sum whitelisted modifiers and claim likely damage; a commander's distinct command eligibility is not the same as individual attack permission.
12. **UI mod advice is not a requirement:** Info+ priority/ACT NOW/high-confidence labels were advisory and sometimes misleading. Ideology entry research remained blocked despite an urgent-looking label.

## Communication protocol

When evidence conflicts, name both readings and what each supports. Example:

> The placement record calls this empty, but the settlement inventory contains an Obshchina there. I would preserve it and use the other legal tile unless your UI explicitly shows the intended replacement.

For a grey action without an explanatory native reason:

> Your unit has movement, so exhaustion is not established. I need the tooltip on the command itself; the tile's generic description does not identify the blocker.

For prices:

> That was the pre-selection quote. The current UI shows 800; use the current quote and recheck the reserve.

For unavailable new fields:

> This connection is not returning dominanceSchedule. The published default changes at Age-progress milestones, but I cannot certify the loaded campaign's next tier from this response.

Keep explanations concise during play. Put deeper evidence in the handoff/KB instead of burying the recommendation in a full raw export.
