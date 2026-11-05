# Sidkick

Sidkick provides read-only, on-demand game data to AI strategy conversations.
Civilization VII is the first adapter.

## Current modes

- One-shot export supports any loaded save with `--output FILE`; legacy no-argument filenames remain available for the two Catherine Exploration saves.
- OpenCode launches a local MCP server over stdio and manages its process itself.
- The ChatGPT bridge runs a managed tunnel runtime, which launches its own stdio MCP server.
- A standalone HTTP MCP server is available for clients that connect to a URL.

The game adapter connects only to `127.0.0.1:4318`. It reads the local player's empire, decisions, settlements, research and government, religion, resources and trade, units, diplomacy, visible threats, turn context, Test of Time victory progress, and known world. Map queries discard hidden tiles, diplomacy and victory queries discard unmet players, and threat queries scan only tiles visible this turn. It does not poll between tool calls or change game state.

## OpenCode: no start/stop wrapper needed

With Sidkick configured as a **local stdio MCP server**, OpenCode launches the Python process when the MCP connection opens, reuses it for tool calls, and stops it when disconnected. This is per connection, not per question. After reboot, open OpenCode in the Sidkick repository and check `/mcps` for the connected Sidkick server. Civ VII must have a save loaded when you request game data.

The configured command is `civ7/.venv/bin/python -m sidkick.server --transport stdio`, run from the repository root. After Python server code or tool registrations change, disconnect/reconnect Sidkick through `/mcps` to load the new code. You do not need to restart Civ VII or the whole OpenCode service.

The ChatGPT bridge scripts below do **not** manage OpenCode's process. Do not start them merely to use Sidkick in OpenCode. The game connection is local, but tool results become part of the conversation sent to your selected AI provider.

## One-shot export

```powershell
.\civ7\.venv\Scripts\python.exe .\civ7\player.py
```

For any leader/civilization/Age, including Modern, choose a new output file:

```bash
civ7/.venv/bin/python civ7/player.py --output modern-t57.json
```

Explicit output paths are relative to the current working directory (or absolute), require an existing parent directory, and **never overwrite** an existing file, symlink or racing writer. A temporary file in the destination directory is published with a no-replace hard link; filesystems without hard-link support fail rather than fall back to overwriting. Temporary files are cleaned up on errors. There is no force flag or automatic directory creation. Files contain detailed local game/map data, so choose a private location. `--output` and `--mcp` cannot be combined. The no-argument command retains its existing behavior: recognized Catherine Exploration saves replace their matching `civ7/save-1-maya.json` or `civ7/save-2-chola.json`; other saves require explicit output.

## Snapshot reliability

`get_civ7_player_snapshot` puts **`snapshotStatus` first**. Read it before combining domains; a successful MCP call does not mean a complete snapshot:

- `status: "complete"`: all reads/checks succeeded and their observed consistency evidence agrees.
- `status: "partial"`: a domain or boundary check failed. Successful domains remain available; failed fields are `null`, not empty lists or stale core fallbacks. `errors` records domain/type/message.
- `status: "inconsistent"`: observed boundary turn/Age/local-player/civilization/leader changed, or domain turns disagree. Data is retained with a warning, not silently retried. This takes precedence over `partial`; check `complete` and `errors` too.
- `status: "unverified"`: reads succeeded but consistency evidence, such as a valid domain turn, is missing. `consistent` is `null`, not `true`.

`start`/`end` contain lightweight boundary markers; `domainTurns` retains provenance even for the flattened player, settlement/archived-Great-Work and unit fields. `complete` describes collection success, not consistency by itself. `consistent` applies only to observed surviving reads and boundary evidence. Collection remains sequential and **not atomic**: same-turn changes, or loading another save with identical markers, cannot be ruled out. There is no automatic retry, cache reuse or game/UI action. Cancellation still propagates rather than becoming partial success.

The full export includes the explored map within the same consistency boundary. The exporter requires `status: "complete"`, `complete: true` and `consistent: true` **before creating a temporary file or publishing an export**; partial/inconsistent/unverified data is returned for diagnosis/advice, not written over a portable save snapshot. The Catherine Exploration filename restrictions remain on no-argument exports only; `--output FILE` supports other complete saves without overwriting a destination.

## Standalone local service

For a client that expects an HTTP URL, start the server yourself and leave the terminal open:

```bash
cd /path/to/sidkick
./civ7/.venv/bin/python -m sidkick.server
```

On Windows:

```powershell
.\civ7\.venv\Scripts\python.exe -m sidkick.server
```

The MCP endpoint is `http://127.0.0.1:8765/mcp`; press Ctrl+C to stop it. It binds only to loopback by default. Neither OpenCode's stdio connection nor the ChatGPT bridge needs this HTTP server. It queries Civ VII only when a client calls a tool. Use the focused empire, decisions, settlement, growth, research/government, religion, resources/trade, units, major-player diplomacy, city-state/independent diplomacy, visible-threats, turn-context, victory-progress, or known-world tools for normal advice. The separate explored-map tool can return a much larger response.

`get_civ7_growth` returns growth progress, legal rural expansion options, separate improvement placement previews, and specialist placements (including empty, blocked, or full slots). Legal growth choices require population ready to place; improvement previews are not promises of legal expansion. Yield changes are per turn, positive maintenance changes are extra costs, and net changes subtract maintenance. Missing improvement previews return `null`, not zero benefit. Hidden tiles are excluded. Growth data is also included in snapshots and exports.

### Building/wonder placement versus growth

`get_civ7_building_placements` answers **where to build or purchase a building/wonder**, not where to place population. It requires one owned settlement's exact displayed name (case-insensitive). Optionally filter to an exact constructible type ID or displayed name:

```json
{"settlement": "Bàakʼ", "constructible": "BUILDING_BANK"}
```

Omit `constructible` to inspect all currently offered building/wonder choices in that settlement. The tool returns deduplicated, revealed legal placement tiles, production/purchase availability and costs, production turns, urban expansion flags, engine-calculated yield bonuses and losses, displaced constructibles, upkeep changes, and net yield changes per turn. Tile `validForProduction`/`validForPurchase` flags describe placement validity; check the corresponding building-level `availableNow` and `affordable` fields before treating it as an action available now. Unaffordable purchases can still have valid tiles. An explicitly filtered unavailable building returns query-provided failure reasons when present; a filter absent from the settlement's construction/purchase queries returns an error.

Yield totals include engine-reported effects on other settlements, not just the selected settlement. Positive `maintenanceChanges` are additional costs; `netYieldChanges` subtract them and account for removed upkeep when overbuilding. Missing placement previews are explicitly marked and return `null` yield data, not zero benefit. Bonus breakdowns retain negative changes and omit hidden source/target coordinates. Ambiguous settlement names fail rather than choosing an arbitrary city; ambiguous building names require a type ID.

The existing decisions tool remains a compact construction/purchase summary, and the growth tool remains separate. Targeted building placements are not added to the all-empire snapshot/export. All these tools are read-only: they never place, queue, or purchase anything. FireTuner itself is a request/response JavaScript interface capable of game-changing commands, but Sidkick exposes only fixed bundled query scripts. Selectors are JSON-encoded data, not executable JavaScript or an arbitrary-code tool.

### Religion and belief choices

`get_civ7_religion` reads the local player's founded religion (including its custom name), selected pantheons and beliefs with effect descriptions, holy city name, belief-class slot counts, and each owned settlement's majority, urban, and rural religions. If the player has not founded a religion, `religion` is `null`; a split or unconverted settlement can have no majority while still having urban/rural religions. For foreign religions, founder identities and custom names are resolved only when the founder has been met. The response does not scan foreign settlements or include hidden world totals.

Choice data distinguishes several checks:

- `claimable`: the belief has not been exclusively claimed, as reported by the game; this alone does not make it usable now.
- `operationAllowed`: the engine's read-only operation check, which can succeed even when the picker has no free slot for that belief class.
- `slotAvailable`: a free class slot under the same earned-belief rules as the game's belief picker.
- `availableNow`: an existing religion has a free class slot and both claimability and the operation check permit adding the belief. Pantheons instead require an unlocked pantheon choice and the `FOUND_PANTHEON` operation check.
- `availableForFounding`: a claimable belief selectable in the initial founding picker, gated by `canFoundReligion` and its class slots. This is not an independently executable add-belief action before founding.

Choices exclude already-selected beliefs/pantheons and retain engine failure reasons and additional descriptions for other options. Religion data is also included in snapshots and exports. The tool never founds a religion, chooses a belief, or converts a settlement.

`religiousUnits` adds owned units with positive definition `SpreadCharges`, their native current-state spread-operation eligibility/failure reasons and charge quotes. Zero remaining charges remain zero; missing charge data remains `null`. Packed units are not queried as deployed missionaries. This uses the action panel's non-target check, not hypothetical destination coordinates: arbitrary missionary-target eligibility, conversion counts/forecasts and custom ability variants remain unverified. Native target plots are not exported and no spread action is issued.

### Great Work inventory and relocation

Call `get_civ7_great_works` without arguments for owned displayed/archived works with stable `works[].instanceIndex`, owned building capacity, damage and current Great Work yield totals. Supply `great_work_index` from that inventory to check one owned instance's native destinations. Archived works omit `SourceCity`; displayed works retain it, and the native destination is a building type rather than a component ID, matching the UI. `availableNow` also requires empty capacity, an undamaged source/destination and a different destination; native permission alone is not enough. Foreign/ambiguous indices are rejected. No UI model is initialized and nothing is selected, moved or archived.

Building yield totals cover the six yield families used by the Great Works UI and are **current whole-building totals**, not the selected work's contribution or a marginal relocation forecast. `netYieldChange` stays `null`; occupied-slot swaps and archive actions are not modeled. This separate query is not added to snapshots; existing settlement Great Work summaries remain available there. Inventory and positive/blocked/archived/displayed cases are fixture-tested while the game is closed; live relocation validation remains pending.

### Government and celebration choices

`get_civ7_research_and_government` retains its current `government` summary and adds `governmentSelection`. Its deduplicated choices follow the current Age's `StartingGovernments` picker, with descriptions, all linked passive-effect descriptions, conditional tradition unlocks/civic depths and each government's celebration definitions. Missing effect text stays `null`; one government's effects are never reused for another. This is a picker-scoped list, not every government in the database or a numerical swap simulator.

`governmentSelection.pending` uses a choose-government notification or the native no-government-selected state. Each choice separates native `operationAllowed` from conservative `availableNow`, which also requires that confirmed pending phase. The current game returns native success even after a government has been selected, so native success alone must not be interpreted as permission to switch at will.

`celebration` includes active/current celebration, native duration, remaining turns only while active, and actual native picker choices including extras. Choice `availableNow` requires both `Happiness.canChoose()` and the native operation check. Government celebration descriptions are rendered with the current native duration, not a projected duration after switching; definition amounts that scale by game speed are not final runtime quotes. `netYieldChange` remains `null`. These queries never open a chooser, change government, choose a celebration or select research.

### Leader attribute trees

`get_civ7_research_and_government` includes attribute points and next-point progress, plus each applicable branch's purchased perks, effect descriptions, unlocks, prerequisite links and `prerequisiteMode` (for example, `OR` does not require every incoming node). Inapplicable nodes are excluded; visible legend-locked nodes retain their lock reason. Wildcard points remain a shared balance, not a separate spendable balance for each branch.

`basePointCost` and `funding` describe the definition's base cost and how many wildcard points would cover a branch-point shortfall. They are not an actual price quote for repeat purchases. `availableNow` uses the engine's read-only purchase check and node/legend state; sufficient funding alone does not unlock a perk. This tool never spends points.

### Archaeology and Culture planning

`get_civ7_archaeology` is a separate Modern-only query for revealed archaeology candidates, local continent research, owned Explorers and Great Work display capacity. It follows the continent lens's `getHiddenFilteredConstructibles` path, excludes hidden tiles before inspecting their contents, and identifies ruins, Museums/Universities (including the Modern University) and natural wonders. Candidate sites retain `visible`; fogged observations may be stale and do not prove an artifact remains. Continental research counts are local research state on already-revealed continents, not a hidden ruin census. Outside Modern, `applicable` is false and domain fields are `null`.

Owned units whose definition has `ExtractsArtifacts` expose stable `instanceId`, movement remaining and the action panel's non-target `EXCAVATE`/`RESEARCH_ARTIFACTS` permission, blockers and additional descriptions. These checks apply **at the Explorer's current position only**; packed units are not queried as deployed. `sites[].availableAfterMoving` remains `null`. No site-by-unit preview matrix, excavation duration, artifact reward, path guarantee or future Tourism gain is invented. Use the movement tool for an owned Explorer's revealed route evidence. Display buildings expose current capacity, used/free slots and damage, but capacity alone does not prove artifact compatibility. Use the Great Work tool for native relocation checks on an artifact you actually own. The archaeology map scan is excluded from snapshots and exports; no lens/UI model is initialized and no action is issued.

**Excavation readiness is not activity.** An `explorers[].operations` excavation entry can report `availableNow: false` because a dig is already underway. Inspect `failureReasons`: a live Modern T57 read said **"Excavation will be complete in 4 turns."** At T56, a zero-movement check returned false without a reason, while a separate native diagnostic confirmed an active excavation and queue size 1. Missing reasons, a disappearing button or no visible digging timer do not prove failure. The diagnostic's raw `operationTimer` was 0 during active excavation and is not a verified remaining-turn counter. The focused tool currently exposes start checks/messages, not active-order/queue fields or a structured countdown; without an explanatory quote, leave progress unknown. Pending rewards and newly owned works must be checked separately: an older displayed artifact does not prove a second dig succeeded. These are historical observations, not current state or a universal dig duration.

For Culture victories, `get_civ7_victory_progress.victoryConditions[].scoringRules[].activationEvidence` links public `ACTIVATE_VICTORY_POINT_TRACKER` definitions to direct or one-attachment research/policy sources. It retains owner/subject requirement-set IDs, local mastery depth versus required unlock depth, government/trait restrictions and native policy-active state. Examples include Industrialization, Flight, Globalism and Capitalism masteries when their links are loaded. These are **prerequisite/source evidence, not evaluated activation**: `activeForLocalPlayer` remains `null` even when research is complete or a policy is slotted. Empty source lists do not prove inactivity; deeper attachment chains, Triumph/building/leader sources, lifetimes and requirement sets are not evaluated. Earned scoring records and native victory targets/countdowns remain separate authoritative observations. This does not simulate a future Culture victory or sum conditional definition bonuses into an alleged Tourism rate.

### Local leader and civilization context

`get_civ7_empire.identity` consolidates the local current leader/persona and civilization, their public ability/unique-item definitions and linked traits/modifier descriptions. Configuration items are matched by exact identity and current Age (or Age-independent definitions), not by persona prefixes or arbitrary old-Age fallbacks. Modifier owner/subject requirement-set IDs are evidence, not evaluated conditions; `appliedYieldContribution` remains `null`. Previous civilization identity is reported separately and does not imply carried-over abilities. Unique-item definitions are not proof of current build/train eligibility; use the focused decisions/research tools for native checks. Missing catalogs stay unknown. This is source/fixture-tested while the game is closed, not a certification of every persona/DLC/mod.

### Yield breakdowns and bounded policy estimates

`get_civ7_settlements` includes `yieldBreakdown` for each yield: the engine's income and signed deductions, building/improvement/resource/trade and other source summaries, maintenance, and named income modifiers with an explicit `percent` unit. `value` is the engine-reported source total; `baseValue` and `modifierValue` are native calculation components, not extra yields to add to it. Sources are not guaranteed to explain all income: `otherBaseIncome` is the residual between reported base income and the returned source totals, not an attribution to a specific effect. Missing sources remain `null`. Use `netYields` for actual settlement totals; neither source values nor modifiers should be summed indiscriminately.

Cards in `get_civ7_research_and_government` include an `impact` record. The first supported estimates cover **only the base science component** of Pet Kot (distinct vegetated rural improvement tiles in cities, not towns), Milpa I (science-tagged buildings on vegetation, including towns), and Tequitl (the native current trade-route count, not projected route choices). Counts include only revealed, owned, complete, undamaged qualifying improvements/buildings and retain per-settlement location evidence. Tequitl returns count evidence without querying foreign settlements. The matching loaded modifier definitions and requirements are checked; unrecognized rules or missing amounts return an unknown estimate.

`status: "estimated"` and `estimatedBaseYields` describe a contribution **if the card is slotted**, not a simulated swap or its actual current empire-wide benefit. They exclude multipliers, cross-yield conversions (such as Catherine's culture-to-science ability), range benefits, future routes and any other effects. `estimatedNetYieldChange` remains `null`, including for active cards. Every unsupported card explicitly returns `status: "unknown"`, null counts and null yields—not zero benefit. These additions also appear in snapshots/exports; no policies are changed and no UI selection or game state is modified.

### City-state and independent diplomacy

`get_civ7_city_states` returns met city-states and met/discovered independent powers, relationships, suzerains, selected bonus effects, eligible bonus choices, local influence, and diplomatic action eligibility/costs, including incorporation. Hidden players and target coordinates are excluded; an unmet suzerain's identity is `null`. The existing `get_civ7_diplomacy` tool remains focused on met major players.

For action summaries, `availableNow` means the game offers the action for this power. If `requiresSecondaryTarget` is true (for example, choosing a unit to levy or a civilization to raid), the final target selection still needs its own eligibility check. `selectedTargetInfluenceCost` is the power-level UI quote, which can be a placeholder; `influenceCost` is `null` for secondary-target actions rather than implying a complete or zero cost. Other missing cost data also returns `null`.

Major-player diplomacy uses the same selected-target cost semantics, retaining its existing `available` field name. It reads the current engine's `targetList1` and that target's `costYieldD`, combines project and selected-target failure reasons, and never treats another player's target as an available choice for the queried leader. `targetChoices` is zero or one for that leader only. `secondaryTargetChoices` is `null` when a secondary selection is required (otherwise zero), rather than disclosing counts from unfiltered target lists. Zero-cost actions remain zero; missing costs remain `null`.

`bonusChoices[].eligible` follows the game's bonus picker; `availableNow` additionally requires a pending choice for this city-state, local suzerainty, and the engine's selection check. It does not imply an existing bonus can be replaced. `ongoingActions` includes only projects initiated by you against that power, with direct progress, required progress, turns remaining, and befriending support cost/eligibility. Other players' ongoing projects are omitted. City-state data and attribute trees are included in snapshots and exports. These tools never spend influence, select bonuses, befriend, levy, or incorporate anything.

### Major-player diplomacy detail

`get_civ7_diplomacy` adds `terms` with public descriptions, definition base duration and support/opposition flags. Available actions separately report the engine's `quotedBaseDuration` and `nativeLastStageDuration`. Ongoing actions include support/response state, `activeStage` with native effect descriptions/availability, and native completion timing. `completion.progress` is the event's actual `progressScore`, **not** reconstructed from duration and rate. Unknown/negative timing sentinels become `null`; zeroes are retained. Stage/duration quotes are not unconditional agreement expiry dates, effect descriptions are not evaluated yield totals, and `turnEnded` is an observed engine field rather than a computed future date.

`availableActions[].secondaryTargets` contains a safe subset of offered choices: met/local players (`Player3`, met independent/city-state `ID2`), owned settlements and currently visible settlement centres of the met primary counterpart (`City`), public unit definitions (`Unit`, **not** unit-instance inventory) and offered amounts (`Amount2`). Each includes the native selector `parameter`/`value`, an exact selected-argument operation check, `availableNow`, `failureReasons` and the native target's `quotedInfluenceCost`. Primary eligibility and a successful checked secondary choice are both required for a secondary action's `available`. A required target type with no offered candidates is not treated as a target-free action. Unknown parameter types and all raw target plots are omitted; `secondaryTargetsComplete` stays false for actions requiring secondary selection. Existing `secondaryTargetChoices` remains `null` there instead of exposing native hidden-target counts. Secondary and primary influence quotes are **not added into a fabricated total**, so action-level `influenceCost` remains `null` when a secondary selection is required.

`City` choices add `settlement: {ownerId, cityId, location}` and use kind `owned-settlement` or `visible-foreign-settlement`. City IDs can repeat across owners: an owned choice must match its offered revealed centre plot, not merely an owned numeric ID. A foreign choice must be offered by the native project, resolve through a currently visible plot to the met primary counterpart and have a currently visible centre with matching owner/ID before its name or selected-operation eligibility is read. Visible outlying districts do not justify fogged-centre metadata. Missing/invalid plots, unknown visibility, missing discovery APIs, mismatched IDs and unrelated owners are conservatively omitted. No foreign empire-wide city list, private yields, queues or garrisons are queried. This extends the existing diplomacy snapshot/export domain, not a new tool. Positive foreign-City choices are fixture-tested; the live Modern T58 save still offered only blocked/empty Send Aid secondary choices.

Incoming hidden/espionage events are conservatively omitted rather than attributed to a met leader; unrelated foreign events are excluded before detailed reads. Enacted peace-deal item terms remain unsupported: the inspected save has no enacted deals, and no verified enacted-item schema was available. `dealCount` and `pendingDeal` retain their existing limited meanings. No working deal is opened, cleared, edited, copied, accepted or sent, and no diplomatic action is performed.

The T58 interface inspection confirmed `getDeal`/`getDealItem` exist, but neither a nonempty local enacted-deal list nor an installed enacted-item consumer was available to verify their contract. The peace UI uses **working-deal** APIs; its schema is not assumed to describe enacted deals and none of those APIs is called. The picker displays primary and secondary influence quotes separately; it does not establish an exact combined cost. These gaps require a representative naturally present scenario/verified native contract, not fabricated negotiations or inferred totals.

### Town focuses, resource assignments and trade comparisons

`get_civ7_available_decisions` includes `townFocus` for towns: Growing Town plus the engine's currently offered project choices, current-selection flags, read-only eligibility and failure reasons, descriptions and population requirements. Project-specific checks use the project's hash, not its database index. Connected-settlement evidence is restricted to owned settlements. `reportedFoodPerConnectedCity` is a current engine value, **not** a projection for another focus or a guarantee that food is currently exported. Focus `netYieldChange` is `null`; Sidkick does not send `CONSIDER_TOWN_PROJECT` or change growth modes.

`get_civ7_resources_and_trade` adds `assignmentChoices` for each owned resource, with current assignment, per-settlement `ASSIGN_RESOURCE` eligibility and failure reasons. Map and off-map instances with the same numeric ID remain distinct. Eligibility checks never assign or unassign resources. Marginal yields remain `null`: the UI's stateful `CONSIDER_ASSIGN_RESOURCE` preview request is not used.

Trade comparisons retain blocked candidates with native status reasons and the current total route count. Only owned or revealed settlements belonging to met players are returned; origin names follow the same restriction. `status: "available"` is a route-level quote, not permission for a particular Merchant to establish it. `merchantOperationAllowed` and marginal `netYieldChange` remain `null`. Engine import/export payloads are not treated as marginal empire-wide gains, and raw paths are omitted.

### Movement and founding-site evidence

`get_civ7_units` includes a stable numeric `instanceId`, distinct from the existing unit-type `id`. Pass it to `get_civ7_movement_and_founding`, optionally with **both** `x` and `y`. Without coordinates, it inspects the unit's current location. Only owned units and revealed destinations are accepted. The tool returns revealed movement-range candidates, per-tile operation eligibility, and the engine's path turn labels without converting them to an inferred number of turns remaining. Attack targets are excluded from movement candidates; packed units and units stopped by a zone of control do not receive an unrestricted range. A path containing any hidden tile is withheld in full, and raw path obstacles are never returned.

Settlers include the engine's current-location and adjacent-plot founding checks. A destination also includes fresh water, terrain/features, current tile yields, resources already revealed within three hexes, and distances to owned settlements. These are **site-comparison evidence**, not a founding-site simulator: arbitrary `legalToFoundAfterMoving` and `newSettlementYields` remain `null`. Current/adjacent founding eligibility is not extended to distant tiles. The tool does not use AI settlement recommendations that could incorporate hidden-world information, and never selects, moves or founds anything. This targeted query is excluded from snapshots/exports.

### Military logistics and visible foreign settlements

`get_civ7_military_logistics()` reads owned commanders (including carrier/squadron/aerodrome commanders), their native combat/noncombat capacities, proven-owned packed-unit IDs, air-unit inventory, reinforcement assignments/native arrival quotes and WMD stockpile counts. Capacities are not inferred free slots. `nativeArrivalTime` preserves the engine quote without converting it to an absolute turn or a guaranteed number of turns remaining. Missing counts/interfaces stay unknown; zero stockpiles remain zero. Foreign packed members and raw reinforcement paths are not returned.

Optionally pass `unit_id` from `get_civ7_units` to check that one owned unit's distinct native `REBASE` (air units) and `REINFORCE_ARMY` (packable non-commanders) operations. Options are deduplicated native destinations filtered to valid revealed tiles; native failure reasons are retained and a failed check never creates positive destinations. Packed/off-map units are not queried as deployed, even if their coordinates look valid. `travelTurns` stays `null`; no mission range, future base compatibility, WMD launch eligibility, damage or diplomatic consequence is simulated. Nothing is packed, moved, rebased, reinforced or launched. This focused query is separate from snapshots/exports and does not create an all-unit destination matrix.

`get_civ7_known_world.visibleForeignSettlements` adds a deduplicated, **currently visible centre** inventory for met foreign owners, with `(ownerId, cityId)`, name, location, population and town/capital flags. An outlying visible district does not expose a fogged centre's metadata. Fogged/hidden centres, unmet owners, private yields/queues/religion/garrisons and foreign empire-wide settlement lists are excluded; this is not a complete remembered world inventory. Missing discovery API returns `null`, not an assertion that no foreign settlements exist. The existing revealed-terrain aggregate is unchanged, and the bounded settlement summary is included with known-world snapshots/exports.

### Combat evidence and promotion choices

`get_civ7_combat_options` requires an owned unit's numeric `instanceId` as `unit_id`, plus target `x` and `y`. The target tile must be **currently visible**, not merely explored. Only visible hostile defenders belonging to met players are exposed. It returns native melee/ranged/naval/air operation checks, failure reasons, observable health, and non-contextual native unit strength. These strengths are **not** a complete battle calculation. District strength is unknown. `expectedDamageToAttacker`, `expectedDamageToDefender` and `outcome` remain `null`: the UI's asynchronous `simulateAttackAsync` request is not invoked. No visible hostile defender means no offered attack options, not a fabricated combat forecast. Combat queries are targeted and excluded from snapshots/exports.

`attacker.readiness` adds native attack range/counts, anti-air strength, movement/attack flags, fortification and embarkation. Missing values remain `null`. `attacker.reportedModifiers` exposes only a small whitelist of local native strength/flanking/friendly-territory fields and the move-after-attacking flag; raw modifier objects, neighbor-count-dependent fields and foreign-unit modifiers are not exported. `targetTerrain` reports the visible terrain/feature/biome and definition defense modifiers. These fields are separate evidence: do **not** sum them into a combat total or assume they apply to this target. `contextualStrength` remains `null`.

For a deployed commander facing an observable hostile defender, `commanderAttack` uses the distinct read-only `UNITCOMMAND_COMMANDER_ATTACK` check, independently of ordinary `canAttack`. Availability requires both native success and the requested visible target in the returned plot list; other native target plots and metadata are withheld. This is not a forecast of participating units or combined damage. T115 live reads verified readiness, local modifier values and terrain with no hostile defender; positive commander-target cases are fixture-tested only.

The existing units tool now includes unowned `experience.promotionChoices`, including commendations, descriptions, discipline, and prerequisite ownership. Choices are deduplicated across prerequisite rows. `availableNow` requires both the picker's `canPromote`/`canEarnPromotion` checks and the native `PROMOTE` operation check. Prerequisite AND/OR semantics are left to the engine (`prerequisiteMode: null`), not guessed from the links. These tools never spend promotion points, select units, declare war, simulate asynchronously or issue attacks.

### Coverage audit

See [the coverage audit](docs/civ7-coverage-audit.md) for delivered boundaries, event/crisis/transition/later-Age gaps, source evidence and verification limits. All six agreed increments are accounted for there; this is not a claim that every Civilization VII mechanic is implemented or live-tested.

### Crisis and pending narrative responses

`get_civ7_turn_context` now includes `pendingEvents`: deduplicated local pending stories and the UI queue heads, with injected option/action/reward text. Static and variable links follow the picker's requisite checks. `availableNow` requires both the native direction-choice check and affordability. `baseCost` is a definition amount/yield, not a final game-speed-adjusted quote; `quotedCost` remains `null`. An event with no eligible links returns the picker's acknowledgement choice (`CLOSE`). Trial-specific choices remain `null`, with an explicit unsupported reason. Empty pending data does not mean that no future crisis response will appear.

Crisis stages are enumerated using the engine's stage count for crisis index `0`. `crisis.settlements` includes owned-settlement infection flags, revealed plague effects and positive remaining durations, damaged constructibles and happiness/unrest evidence. Private effects belonging to another owner and hidden plot locations are excluded. Plague `definitionBaseDamage` is not a damage forecast; damage attribution and numerical crisis yield penalties remain unknown. These queries neither open/close popups nor choose responses, trigger events, modify policies or advance turns.

### Age-transition planning

`get_civ7_age_transition` reads the configured next Age and **`AgeTransitionPlayerCivilization`**, not the normal civilization setup selector. Candidate `setupValid` is combined with local `Game.Unlocks` progress to report `unlocked` and `eligibleByChecks`. Each unlock path includes requirement descriptions, native states, current/total progress and gameplay-versus-leader/history flags. Links are not assumed to be AND prerequisites, and a selector-valid civilization is not assumed to be unlocked. The configured unlock-bypass flag is explicit; missing unlock data stays unknown. `selectionPermission` is `null`: these planning checks are not an equip/select operation.

`dedications` describes the **current engine deck**, including native deck size, point balances, costs, individual/group limits, selected cards and read-only ADD checks. A completed or full deck cannot report an addition as available merely because the native check succeeds. `deckAge` is explicit and `nextAgeChoices` remains `null`; old Exploration cards must not be presented as Modern choices. Card effect metadata and AI lists are not exposed.

`mementos.currentSlots` and `transitionSlots` keep current and prospective loadouts distinct. Entries come from the filtered local setup parameters, with effect descriptions and domain-validity reasons. Online profile metadata is never requested; profile unlock status and equip permission remain `null` rather than being inferred from list membership. The finish-operation check is read-only and is not a general selection-phase flag.

`carryOverRules` provides **source-inspected estimates**, not a final-state simulation. For the installed post-load script's ORIGINAL and KEEP_MORE settings, the next Exploration/Modern gold and Influence cap estimates use the native game-speed adjustment. `currentGoldAboveCap` and `currentInfluenceAboveCap` compare today's balances with those estimates, not predicted losses. The script's non-capital-city regression precedes retention cards; final city/town status, retained units, dynamic card effects and other transition outcomes are not predicted. Unknown modes/next Ages return unknown caps. No transition is performed to verify these estimates. Transition planning data is also included as `ageTransition` in snapshots/exports.

### Modern factories and rail evidence

`get_civ7_resources_and_trade` adds per-settlement `infrastructure`: native rail-network membership, rail-station presence and land connectivity to the capital. These are distinct signals; a station alone does not prove a rail connection. In Modern, `construction` retains native factory/station build and purchase checks, including blocked reasons and quoted costs when present; missing entries remain `null`. No placement preview or construction request is sent.

In Modern, `factory` follows the commerce UI's factory indicator and reports the selected resource, native factory-resource count, producing flag and separately counted assigned factory resources. Other Ages return `factory: null` rather than treating Exploration treasure prerequisites as factories. `currentGDP` and `gdpChangeOnAssignment` remain unknown; no rate, future factory output or marginal yield is inferred. Existing per-resource `assignmentChoices` supply destination eligibility for factory resources too.

`get_civ7_movement_and_founding` adds `rail`, using the distinct read-only `UNITCOMMAND_MOVE_BY_RAIL` check. It returns deduplicated, revealed native destination plots and optional destination membership, separately from ordinary movement/pathfinding. Hidden/invalid plots and raw native metadata are withheld; packed units are not checked as deployed passengers. Travel cost, rail path and future connection forecasts remain unknown. These additions were live-read in Exploration at T114 (12 settlements, no rail networks and a blocked rail command); positive Modern factory/rail cases are fixture-tested only.

### Modern ideologies and project requirements

`get_civ7_research_and_government` adds Modern-only `ideology`: chosen ideology and loaded candidates with their entry civic, current research costs/turns/unlocks and native `SET_CULTURE_TREE_NODE` eligibility/failure reasons. Policy cards include an `ideology` affiliation. `researchAllowed` means the entry civic can be selected for research, **not** that an ideology can be adopted or changed immediately. `adoptionPermission` and numerical `diplomaticImpact` remain unknown. `rivalIdeology` is the loaded definition link, not a simulated diplomatic penalty or reward. No civic or policy is selected.

Each ideology's `branch.definitionNodes` lists public loaded civic/benefit definitions, including mastery depth and government conditions, for comparison before the branch is revealed. These are **not** proof of local applicability or eligibility. `branch.nodes` separately reports available local non-locked research state, costs, turns, prerequisite links/mode and native research checks; an empty local list does not mean zero progress or free research. Hidden unlock definitions are excluded. `adoptionBonuses` lists conditional adoption-order rules, effect types and only the raw `Amount`/`SlotType` definition arguments. The local player's adoption rank/bonus applicability remains `null`; the tool neither counts unmet adopters nor promises first-/second-adopter slots.

`get_civ7_victory_progress` adds Modern-only `modernProjects`, covering loaded positive-cost, non-town, non-upgrade production projects—including conversion projects, not an assertion that every item wins a victory. Each entry retains definition prerequisites, visible project-unlock nodes with required/current mastery depth, native required-Legacy-Path completion when supplied, and local versus empire-wide constructible scope. Owned-settlement BUILD checks include blocked projects and failure reasons, native requirement flags, current production costs and turn quotes for available projects. Unlock links are not assumed to be an AND dependency chain or a complete requirement evaluator. Completed project counts and victory-completion forecasts remain `null`; wonder, Great Person and other non-project victory paths are not implied to be covered by this inventory. No production request is sent. Positive Modern cases are fixture-tested only; the T114 Exploration live save verified that both additions return `null` outside Modern.

### Victory dominance and rule-change warnings

Unavailable native victory targets (`-1`) are reported as `targetPoints: null`. Scoring arguments prefer nonempty text values over unused numeric defaults; genuine numeric zeroes remain zero.

`get_civ7_victory_progress` adds `victoryAlerts` for local/met-player dominance countdowns and upcoming easing of dominance ratios. Each victory's `dominanceSchedule` reads the loaded `VictoryDominationPercents` rows matching the campaign starting Age and previous-Age count, and reports all tiers plus the current and next tier. A `DominationPercent` of 300 means **4×**, not 3×; 100 means **2×**. In the inspected rules, relevant Modern campaign paths can ease from 4× to 3× to 2× and lower as Age progress increases. Do not plan around a permanent remembered ratio. The previous lost game's exact cause has not been reconstructed from its save.

Native `targetPoints` and countdown/prerequisite readings remain authoritative; the tool never recomputes a global target from only met rivals. Tier boundaries are Age-progress percentages, **not turns until a change**. Countdown turns remaining are conditional on continued qualification, not guaranteed victory dates. Unknown countdown/requirement values stay `null`, not invented zeroes. Missing schedules/configuration do not become a default 1× rule. Public `scoringRules` include non-project sources such as wonders/Great Works, definition points, activation flags and scoring arguments. These describe conditional loaded rules, not proof of local activation or a complete dependency simulator. Unmet players are skipped before their objects are read. This increment is source/fixture-verified; the game was closed during implementation, so live threshold-change/countdown verification remains pending.

### Culture scoring explanations

Culture `scoringRules` now pair existing research/mastery/policy `activationEvidence` with owned `localEvidence`: current wonder candidates, tagged unique improvements, trait-linked building candidates and displayed versus archived Great Works of the rule's object type. Unique-improvement rules use `assetBasis: "tagged-unique-improvements"` and the loaded `UNIQUE_IMPROVEMENT` tags, so traitless independent-power improvements such as Monasteries are included. A trait link alone is not sufficient; unavailable tags leave the candidate list `null`. Incomplete/damaged assets remain visible as candidates, not qualifiers; a definition's Age is not the asset's build/scoring Age. Other tracker families return an explicit unknown asset explanation.

Unique-quarter rules retain their separate trait-linked `candidateAssets` and add per-settlement `uniqueQuarters`: one record per native-recognized district at revealed owned building locations, with native `isUniqueQuarter`, definition-required building types and observed same-location building completion/damage. Two trait-linked buildings are never used to reconstruct recognition or counted as two quarters. Missing native interfaces/definitions or conflicting ownership return `null`; `inventoryComplete: false` means current observations may be partial. Native recognition is not proof of Tourism qualification, activation or earned points. Live Modern T57 reads verified two Uwaybil K’uh quarters and eight tagged unique improvements (six Monasteries and two Obshchinas).

Per-settlement observations include native rail membership and complete/undamaged presence of a loaded `REQUIRED_CONSTRUCTIBLE`. These do **not** establish whether its requirement applies locally or empire-wide, or whether a tracker is active. Missing/withheld inventory leaves absence unknown; archived works aren't treated as displayed. `activeForLocalPlayer`, `qualifyingCount`, `attributedPoints` and unverified scope remain `null` even when observed prerequisites are met.

`ledgerEntryIndices` reference the local player's existing `progress.scoring` entries for that victory, using **tracker family only**. Several rules can reference the same entries, including historical entries from other Ages or Great Work types. Do not sum or attribute those points per rule, or infer lost points from a missing current display. The native ledger records earned points; current candidates explain observations, not incremental Tourism or a victory forecast. This extends the existing victory tool and its snapshots/exports; no new tool or game action is added.

**Culture boundary review:** the remaining unknowns are not pending numerical features. Inspection of the installed UI/schema and the loaded local `Victories`, `Culture`, `Game.Culture`, `Game.VictoryManager` and `GameEffects` interfaces found no verified current tracker-activation getter or pure marginal-Tourism preview. `RequiresActivation` describes a definition, not runtime state; met mastery/building/rail observations must not be promoted to activation. Native scoring records expose tracker-dependent source `id`/`data`, not a uniform `ScoringId`: matching names, hashes or point amounts cannot generally attribute an award to one rule. The free-form scoring arguments don't establish local versus empire-wide Airfield/rail scope or the meaning of a numeric zero. These limits require a documented native contract or representative independent evidence to revisit—not hypothetical game actions, foreign-inventory scans or a general modifier simulator. Current displays and historical earned points remain separate; no exact future Culture win date is promised.

## ChatGPT architecture

ChatGPT shows two Sidkick entries under Plugins because they are different layers:

- **Sidkick Engine** is the App connection. It registers the MCP tools and connects ChatGPT to the tunnel.
- **Sidkick** is the user-facing Plugin. It supplies the name, description, icon, and starting prompt, and depends on Sidkick Engine for live data.

The complete request path is:

```text
Chat prompt -> Sidkick Plugin -> Sidkick Engine -> authenticated tunnel
-> local tunnel-client -> Sidkick Python MCP server
-> Civ VII FireTuner at 127.0.0.1:4318
```

Results return through the same path. The game connection remains local, no inbound game port is exposed, and only data requested by a tool call is returned to the conversation. A Plugin can appear installed while the local tunnel is offline; live calls require Civ VII with a save loaded and the ChatGPT bridge running. ChatGPT does not launch this tunnel runtime for you.

## Private ChatGPT connection

Sidkick uses [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) in supervised stdio mode. Create or reuse a tunnel in Platform tunnel settings and a restricted runtime API key with Tunnels Read + Use. Do not use an admin key or paste credentials into chat or command arguments. Creating a tunnel/ChatGPT app connection is separate from running these scripts.

### Linux

Prerequisites:

- Bash and Python 3.10+.
- A working `civ7/.venv/bin/python` environment with Sidkick's dependencies. See [adapter setup](civ7/README.md); the Linux environment commands are `python3 -m venv civ7/.venv` and `./civ7/.venv/bin/python -m pip install -r civ7/requirements.txt` after obtaining the FiretunerTerminal dependency.
- The official **full** Linux `tunnel-client` release for your architecture, installed at `tools/tunnel-client/bin/tunnel-client` with its companion files. Download and verify it using the [official release instructions](https://github.com/openai/tunnel-client#validate-a-downloaded-release). The narrower `tunnel-client-runtime` binaries do not support the lifecycle commands these wrappers use. The scripts do not install or download anything.

First-time setup, from the repository root:

```bash
./scripts/configure-chatgpt-tunnel.sh tunnel_0123456789abcdef0123456789abcdef
```

This securely prompts for the runtime key without echoing it, saves it in ignored `.sidkick/tunnel-runtime-key.txt` with mode `0600`, saves the tunnel ID in `.sidkick/tunnel-id`, and connects the managed runtime. It reuses an existing owner-only key; add `--replace-key` to deliberately replace it. Use an interactive terminal for the hidden prompt. The `.sidkick/` directory and its generated profile/runtime directories are owner-only (`0700`). Configuration remains saved if connecting fails, so correct the prerequisite or connection problem and retry start.

Daily use, including after reboot:

```bash
./start-sidkick.sh
./sidkick-status.sh
./stop-sidkick.sh

# Reload the bridge's Python process after server/tool changes:
./stop-sidkick.sh && ./start-sidkick.sh
```

The wrappers work from any directory when invoked by their path. Start reports success only after checking the tunnel client's `process_running`, `healthy`, and `ready` flags; status exits nonzero when any is false. Bridge readiness does not establish that Civ VII has a save loaded or that ChatGPT has refreshed its tool list: verify those separately. Stop targets only the managed `sidkick` alias in this repository's isolated `.sidkick/linux-runtime` state, not OpenCode, other tunnel aliases, or arbitrary Python processes. The tunnel client owns supervision and logs; these scripts do not use `nohup`, PID-file killing, or a second HTTP server.

The runtime can survive closing the launch terminal, but these wrappers do **not** install a boot/login service. Run start again after reboot. Keep only one bridge runtime active per tunnel ID: do not run the Windows and Linux bridges simultaneously against the same tunnel. OpenCode may use its separate direct stdio connection without a tunnel.

For CLI troubleshooting, use the same repository-scoped state rather than the tunnel client's global aliases:

```bash
TUNNEL_CLIENT_STATE_DIR="$PWD/.sidkick/linux-runtime" \
  ./tools/tunnel-client/bin/tunnel-client runtimes status sidkick --json
```

Review CLI output locally before sharing; keep keys and private logs out of chat and Git. If a wrapper reports a client exit code, this native status output provides more detail without the wrapper echoing potentially sensitive client errors.

### Windows (existing wrappers)

Install the official full client under `tools\tunnel-client` and prepare the Python environment, then run:

```powershell
.\scripts\configure-chatgpt-tunnel.ps1 -TunnelId tunnel_0123456789abcdef0123456789abcdef
```

The script prompts securely for the runtime key, saves it in the ignored `.sidkick/` directory with access limited to the current Windows account, starts the managed runtime, and prints its health status. Future sessions use:

```powershell
.\scripts\start-chatgpt-bridge.ps1
.\scripts\stop-chatgpt-bridge.ps1
```

For double-click use, run `start-sidkick.bat` or `stop-sidkick.bat` from the repository root. Automatic startup is controlled by `enable-start-with-windows.bat` and `disable-start-with-windows.bat`; `start-with-windows-status.bat` reports the current setting. This uses the current user's Windows Startup folder and does not require administrator rights.
