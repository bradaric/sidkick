# Civ VII read-only coverage audit

## Scope and evidence

Audit date: 2026-11-04. This records the agreed sixth increment: an inventory of event, transition and later-Age gaps, **not implementation of every missing system**.

Evidence consists of the bundled query scripts, the installed game's JavaScript UI sources, fixture tests and live reads from the existing Exploration save (turns 106–110). No save was loaded, advanced or changed by Sidkick to exercise another scenario. Finding an API in UI source does not establish that it works safely outside that screen or in every ruleset.

Game-source paths below are relative to the installation's `Base/modules/` directory. Repository links are relative to this document. No UI managers were initialized, game-changing requests sent, or stateful/asynchronous previews invoked for this work.

## Delivered increments

| Increment | Commit | Delivered boundary |
|---|---|---|
| 1. Policy impact | `ea73052` | Settlement yield-source summaries and base-science estimates for Pet Kot, Milpa I and Tequitl. All other card impacts, cross-yield conversions and net swap totals remain unknown. |
| 2. Diplomacy validation | `7ffee37` | Selected-player costs from `targetList1[].costYieldD`, selected-target failure reasons and conservative secondary-target handling. Not a full agreement/negotiation system. |
| 3. Town/resource/trade comparisons | `e8fb189` | Engine-offered town focuses and checks, owned connection/food evidence, resource-assignment eligibility and known revealed route candidates/reasons. Marginal yield projections and Merchant-specific permissions remain unknown. |
| 4. Founding/movement | `85e7443` | Targeted movement-range/path checks and revealed site evidence; current/adjacent Settler founding checks. Arbitrary future-site founding legality and settlement yields remain unknown. |
| 5. Combat/promotions | `7d8a625` | Visible hostile target evidence, attack-operation checks and promotion/commendation choices with native eligibility. Damage, contextual battle modifiers and outcomes remain unknown. |
| 6. Coverage audit | This document | Records the remaining gaps and verification limits without expanding into another implementation project. |

These boundaries are also described in the [README](../README.md). With the post-audit transition addition, there are 20 registered read-only MCP tools; the two targeted unit queries are not added to snapshots/exports.

## Events and quests

**Post-audit update:** turn context now adds pending local event choices using native pending IDs and UI queue heads, picker-equivalent requisite filtering, injected text, definition costs, affordability and read-only operation eligibility. Static/variable-link and blocked/acknowledgement cases are fixture-tested. Live verification at turn 113 exercised an empty pending queue; positive pending-choice cases have not yet been live-verified. Trial-specific choices and final runtime cost quotes remain unknown. The following original gap inventory is retained as historical context.

**Covered:** [turn_context.js](../civ7/turn_context.js) returns active quests, progress/goal, deadlines and local notification summaries, severity and turn-blocking flags. Notification coordinates are filtered against revealed tiles.

**Not covered:** pending event choices, choice-specific costs, requisite links, affordability/eligibility and injected reward text. A quest summary is not a complete event-option inventory, and a notification alone does not establish that a choice is actionable.

**Observed UI evidence:** `base-standard/ui/narrative-event/screen-narrative-event.js` reads `Stories.getFirstPendingDiscoveryLastMetID()`, `find()`, `getOrderedLinks()`, requisite-link checks and injected option/reward text. Its activation handler separately checks and sends `CHOOSE_NARRATIVE_STORY_DIRECTION`; Sidkick does neither. Static `NarrativeStory_Links` alone would miss variable/requisite choices. Narrative trials and other popup variants have not received full coverage validation.

**Verification limit:** no pending narrative-choice fixture or live choice save was added in this increment. These are source-identified gaps, not a certified implementation.

## Crises

**Post-audit update:** turn context now uses the engine's stage count for index `0` and returns owned-settlement infection/plague-duration, damaged-constructible and happiness/unrest evidence. At turn 113, stage 1 and plague effects in Copan and Uxmal were live-verified. Damage attribution, numerical crisis yield penalties and nonzero crisis-index enumeration remain gaps. The following describes the original audit baseline.

**Covered:** current crisis index `0`, stage, stage thresholds, reported minimum/maximum stage duration, active/available crisis cards, and ordinary settlement happiness/unrest data. Live turn 110 reported an active Exploration crisis at stage 0, with one active quest and no local notifications.

**Not covered:** crisis-specific settlement states, outbreak effects, a unified list of crisis responses and their consequences, or an inventory of alternative crisis indices. The query explicitly checks index `0` and stages `0..3`; this is not a generic multi-crisis model.

**Observed UI evidence:** `base-standard/ui/crisis-meter/crisis-meter.js` also uses index `0` for its threshold display. Crisis narrative choices pass through event/policy interfaces. Their existence does not make generic timing data sufficient to advise on every response.

**Verification limit:** the live timing read does not test other crises, later stages, or response outcomes.

## Age transitions

**Post-audit update:** `get_civ7_age_transition` now combines the next-Age transition-specific civilization selector with local native unlock progress, including requirement states/current/total. It distinguishes current and transition Memento setup slots without querying online profile metadata. Native current-deck costs/limits and ADD checks are exposed with an explicit deck Age; future Dedication choices are not fabricated. ORIGINAL/KEEP_MORE gold/Influence caps are source-inspected, game-speed-adjusted estimates, not final-state predictions. The tool is included in snapshots. At turn 113, Modern candidates, unlock requirements, the completed Exploration deck, two transition Memento slots and KEEP_MORE cap estimates were live-read; no Age transition or profile/equip operation was performed. The original inventory below is retained as historical context; profile unlock/equip permission, future deck generation and final carry-over outcomes remain unverified.

**Covered:** [player.js](../civ7/player.js) returns valid Triumph definitions, progress, completion and reward descriptions, plus selected/available Dedication card summaries and placement-complete status. [victory.js](../civ7/victory.js) returns Test of Time scores and countdown prerequisites for the local player and met major players. Age progress/countdown fields appear in turn context.

**Not covered:** a complete next-civilization eligibility/ownership view, unmet unlock conditions, Memento selection, Dedication costs/group limits, placement-effect eligibility, or a carry-over/reset consequence simulator. Dedication `slotCount` is currently fixed at 3 in `player.js`, not certified across alternate rulesets. Age progression points should not be interpreted as a precise time-to-transition forecast unless the countdown semantics are established.

**Observed UI evidence:**

- `core/ui/shell/create-panels/age-civ-select-model.js` uses setup-domain values, invalid/ownership reasons, previous civilizations and configuration-database unlock data. It contains an unimplemented `unlockCondition` field, so its display object is not itself a complete gameplay requirement evaluator.
- `base-standard/ui-next/screens/age-transition/age-transition-bootstrap.js` includes civilization and Memento selection stages. The older shell selector has setters that must not be invoked by a query.
- `base-standard/ui/advanced-start/model-advanced-start.js` handles costs, group/individual limits and placeable effects beyond the summaries currently exported. Its request-sending handlers were inspected as source only, not executed.

**Verification limit:** no Antiquity-to-Exploration or Exploration-to-Modern transition was performed. Transition-specific fields and reset rules remain unverified rather than inferred from the current save.

## Later-Age systems

Ordinary tool data may include later-Age units, buildings, projects and cards when the engine offers them. That is **not** evidence of complete later-Age mechanic coverage.

| System | Current coverage | Remaining gap / source evidence |
|---|---|---|
| Treasure Convoys | Resource descriptions/classes, owned units and generic scores/projects | No settlement generation timer, cargo-value breakdown or generation prerequisites. The commerce UI's `populateTreasureFleetData()` reads generated gold/GDP/points, automatic value, improved-resource status and turns until generation. |
| Factories and factory resources | Generic owned resources and assignment checks | No explicit factory-resource production state or factory-specific comparisons. `populateFactoryResourceDataForCity()` reads `getFactoryResource()`, `getNumFactoryResources()` and construction prerequisites. |
| Rail transport | Ordinary movement/path evidence | No explicit rail-network inventory or rail-specific destination checks. `base-standard/ui/interface-modes/interface-mode-move-by-rail.js` uses the distinct `UNITCOMMAND_MOVE_BY_RAIL` check; ordinary movement is not a substitute. |
| Ideologies | Generic government and policy/card descriptions | No chosen-ideology summary, ideology-choice eligibility or detailed ideology-specific diplomatic effects. The UI reads `Culture.getChosenIdeology()` and ideology-specific card metadata. |
| Air/naval combat | Native attack-operation eligibility for visible hostile targets | No damage simulation, air-base/range mission inventory or comprehensive carrier/squadron logistics. No live positive attack case was available during verification. |
| Nuclear/WMD systems | Generic unit/building/project descriptions where offered | No stockpile, launch eligibility, blast-effect or diplomatic-consequence output. `base-standard/ui/interface-modes/interface-mode-wmd-strike.js` has distinct WMD operation/radius/war checks. None were invoked or implemented. |
| Later scientific/victory projects | Engine-offered production projects and generic victory/countdown data | No specialized milestone dependency or completion forecast. Broader project-specific interfaces and rule variants are not certified by the current Exploration save. |

The commerce source for the first two rows is `base-standard/ui-next/screens/commerce/commerce-screen-model.js` (`populateTreasureFleetData` and `populateFactoryResourceDataForCity`). These references establish missing fields and possible read surfaces, not approval to invoke stateful UI setup or game-changing handlers.

## Verification limits

- Original six-increment baseline verification: **54 Node tests and 36 Python tests passed**. `scripts/check-live-mcp.py` discovered and called all **19 tools** successfully using a temporary stdio child, not a restart of the user's persistent MCP connection.
- Live town/commerce checks returned 9 towns, 40 resources, 440 resource-destination checks and 5 current routes. An explicit Scout destination path and a blocked current-location Settler founding check were read successfully.
- The units query returned 63 unowned promotion/commendation choices at turn 110. Positive and blocked picker/native eligibility combinations are fixture-tested; no points were spent.
- The live save had **zero visible enemy units**. The combat tool's no-hostile-target path was live-tested; positive hostile-unit/district eligibility, invisibility, neutral/unmet owners and packed-attacker cases are fixture-tested, not live-certified combat scenarios.
- The off-map resource-ID collision is fixture-tested; the live resource probe had no off-map resources. General factory-resource, rail, air, WMD and transition behavior was not exercised in a representative later-Age save.
- No numerical combat simulation, policy-swap simulation, resource/focus marginal-yield simulation or arbitrary future founding-validity simulation was run. Their outputs remain explicitly unknown where exposed.
- The official Linux tunnel client is still absent at `tools/tunnel-client/bin/tunnel-client`. Wrapper tests pass with a fake client; the real ChatGPT tunnel lifecycle remains unverified.

## Remaining technical gaps

These are retained limitations, not additional changes included in the six increments:

The later crisis/transition additions above address part of this baseline; the documented unknowns and original scenario limits still apply.

- **Snapshot consistency and failure isolation:** [player.py](../civ7/player.py) gathers domains sequentially without enforcing a single turn; one exception still aborts the whole snapshot.
- **Export generality:** one-shot export paths currently recognize Catherine's Exploration Maya/Chola saves only. Targeted placement, movement and combat queries are deliberately excluded from the export.
- **Economy/policy completeness:** source summaries can leave unattributed base income; most cards have unknown impact. Government alternatives, celebration choices, full source-level bottleneck explanations and general what-if effects remain incomplete.
- **Diplomacy depth:** agreement terms/expiry, negotiation details and secondary-target choices are not a complete API. Older ongoing-action progress still uses an inferred formula and has not been revalidated as a general progress model.
- **Religion/Great Works:** belief/owned-settlement data and inventories exist, but missionary-target conversion previews, visible foreign-settlement religion and Great Work relocation eligibility/yield comparisons do not.
- **World and logistics:** no full visibility-safe foreign-settlement view, exploration-opportunity inventory, rail/carrier/reinforcement option inventory or long-horizon movement guarantee. Revealed data and currently visible combat targets remain distinct scopes.
- **Ruleset and identity coverage:** no comprehensive current leader/civilization ability/rules-modifier view, and many non-unit records still use names or type IDs rather than stable instance selectors. Broad DLC/mod, leader, civilization and cross-Age compatibility is not certified by a single save.

Hidden-world information and game-changing actions remain deliberately outside Sidkick's intended scope. Read-only annotations are not an independent security certification of every historical adapter field; new interfaces still need explicit visibility and side-effect tests.
