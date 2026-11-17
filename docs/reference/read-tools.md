# Read-tool reference

**31 default tools**, checked against `create_server()` on 2026-11-17.
Exact signatures/defaults come from MCP discovery and
[server registrations](../../sidkick/server.py); [queries](../../civ7/queries.py)
provide selector validation. All are game-read-only. SVG publication writes only
its own temporary cache; the explicit transition workflow can read profile metadata.

## Choose the smallest relevant read

| Tool | Purpose / selectors |
| --- | --- |
| `get_civ7_empire` | Treasury, yields, limits and current leader/persona/civilization definitions |
| `get_civ7_available_decisions` | Production/purchases, exact queues/tokens, town focuses, pending capture decisions |
| `get_civ7_settlements` | Owned settlement infrastructure, population, health/happiness, yields and breakdowns |
| `get_civ7_growth` | Ready population, legal rural expansion, separate improvement previews and specialist slots/upkeep |
| `get_civ7_building_placements` | Required exact owned `settlement`; optional constructible type/display-name filter |
| `get_civ7_research_and_government` | Research, government/celebration, card groups, ideology, attributes and Syncretism |
| `get_civ7_religion` | Own religion, belief/pantheon/founding choices, owned settlement religion and spread-unit readiness |
| `get_civ7_great_works` | Owned displayed/archive inventory; optional owned `great_work_index` for destinations |
| `get_civ7_archaeology` | Modern-only revealed sites, local continent research, owned Explorers and display capacity |
| `get_civ7_resources_and_trade` | Exact resources/assignments, routes, infrastructure and Modern factory state |
| `get_civ7_units` | Owned numeric instance IDs, readiness, packing/reinforcement, promotions/upgrades, Scout automation |
| `get_civ7_military_logistics` | Own commanders/armies, air/reinforcement/WMD inventory; optional owned `unit_id` checks |
| `get_civ7_movement_and_founding` | Required owned `unit_id`; optional paired x/y; move/path/site/founding/rail evidence |
| `get_civ7_combat_options` | Required owned `unit_id` and target x/y; visible exact hostile target/native permissions |
| `get_civ7_known_world` | Revealed world summary, known relationships and visible met-owner settlement centres |
| `get_civ7_diplomacy` | Met majors, war opponents, projects/responses/secondary choices, first-meet and Call to Arms |
| `get_civ7_city_states` | Met minors/discovered independents, specialization, suzerainty, bonuses/projects/befriending races |
| `get_civ7_peace_negotiation` | Required exact met counterpart; incoming/outgoing working draft, terms and offers |
| `get_civ7_peace_city_offer` | Exact counterpart and owner-qualified city/coordinates; narrow native city offer |
| `get_civ7_visible_threats` | Visible hostile units, not peaceful foreign civilians or unseen forces |
| `get_civ7_turn_context` | Turn/Age readiness, blockers, first ready unit, pending events/quests, crisis and narrow popup evidence |
| `get_civ7_victory_progress` | Test of Time scoreboard, countdowns, loaded scoring rules, Military settlement ledger and Modern projects |
| `get_civ7_age_transition` | Profile-free planning, unlock paths, current deck and carry-over estimates |
| `get_civ7_transition_workflow` | Focused execution phase/tokens; deliberate pending Memento profile-eligibility reads |
| `get_civ7_saved_games` | Bounded local single-player save metadata/tokens, not saved world inventories |
| `get_civ7_loading_state` | Ordinary-load observer and safe Begin token, including before GameStarted |
| `get_civ7_civilopedia` | Sections, search/browse and exact public article/requirement references |
| `get_civ7_player_snapshot` | Broad strategy collection; inspect `snapshotStatus` first |
| `get_civ7_explored_map` | Large per-tile revealed map; avoid unless actually needed |
| `get_civ7_ascii_map` | Bounded flat-top viewport with current visible entity lists/coverage |
| `get_civ7_svg_map` | Same bounded evidence, north-up colored SVG and fixed preview URL |

Targeted placements, movement, combat, work relocation, logistics, archaeology,
Civilopedia, small map previews and execution workflows are not silently expanded
into broad snapshots. See [snapshots/exports](../snapshots.md), [maps](../maps.md),
[peace](../peace-negotiation.md) and [transitions](../transitions.md).

## Evidence rules

### Placements and yields

- Growth **legal expansion** needs pending population; improvement previews are
  not a promise of legal expansion. Missing previews are null, not zero benefit.
- Building placement checks require one unambiguous owned settlement (displayed
  name, case-insensitive). Prefer exact constructible IDs for ambiguous names.
  Tile validity is distinct from building-level availability and affordability;
  valid purchase tiles can remain unaffordable. Fresh visible target tokens bind
  construction/repair writes, not an unlimited permission to build there.
- Yield deltas can include other settlements. Positive maintenance changes are
  extra costs; `netYieldChanges` subtract upkeep. Missing previews stay unknown.
- Settlement `netYields` are authoritative totals. Category `sources`,
  `otherBaseIncome`, and detailed `baseIncomeEvidence` are alternative explanations,
  not additive income streams. The latter is additive only for native ADDITION
  roots; residuals/unknown values remain explicit. `matchesSummary` compares
  separate reads, not atomic consistency.
- `incomeAdjustment` is observed gross minus base income in yield units/turn,
  already included in gross income. Named effects are not exact per-card attribution.
- Card `impact` estimates support **base science only** for Pet Kot, Milpa I and
  Tequitl, if slotted. They exclude multipliers, conversions and other effects;
  unsupported cards and net swap yields stay unknown.

### Research, religion and works

- Leader/civilization abilities, ideology definition nodes and requirement-set
  IDs are conditional source evidence, not evaluated applicability or unlocks.
  Previous civilization identity does not imply its abilities persist.
- Government availability needs an actual pending phase; celebration availability
  also recognizes a live local chooser notification when canChoose is false.
  Ideology `researchAllowed` is not instant adoption/switch permission.
- Syncretism candidates and replacement warnings come from the native picker.
  Signed `choiceId` is a legacy civilization **trait** hash. Rewards are not
  complete resulting unit/yield forecasts.
- Attribute base cost/funding is not an exact repeat-purchase quote. Shared
  wildcard points cannot be spent independently by every branch.
- Belief `claimable`, native `operationAllowed`, `slotAvailable`, `availableNow`
  and `availableForFounding` are different checks. Religion founding choices
  expose exact ReligionType/icon references and claim status, not browser assets.
  A custom name is allowed only for a custom religion/icon and is limited to
  16 UTF-16 units; standard religions cannot be renamed by the action.
- Spread-unit readiness is **current non-target** evidence; packed/off-map/unknown
  packing suppresses deployed checks. Charge zero is not missing data. No pure
  converted-population or arbitrary destination conversion forecast is provided.
- Great Work `instanceIndex` is not a definition index. Selected-work destinations
  require compatible free undamaged slots. Whole-building yields are not that
  work's contribution; `cityWorkTypeYieldQuote` is city/type scoped, not a marginal
  building-specific relocation gain. `netYieldChange` remains unknown. Explicit
  archive/move actions exist separately; there is no atomic occupied-slot swap.
- Archaeology site `visible` matters: revealed fog can be stale. Explorer start
  readiness is not activity. An unavailable dig can have a completion message in
  `failureReasons`; absent text does not prove failure. A structured active-order
  countdown and guaranteed reward/after-moving eligibility are not exposed.

### Units, movement and combat

- `instanceId` identifies an owned unit; `id` can be its public type. Nullable
  `isPacked`/`isReinforcing` distinguish observed presence, absence and unknown.
  Reinforcement army ID zero is valid. Withheld coordinates do not prove packing.
- Missing own-army membership stays unknown, not an empty army. Capacity is not
  free slots. Native reinforcement ETA is not a guaranteed arrival time.
- Ordinary movement supports native fog-capable checks, but hidden path contents
  are withheld. Missing/empty path evidence alone does not prove illegal movement.
  Revealed path turn labels are not a guaranteed future arrival countdown.
- Current/adjacent founding checks do not certify a distant future site or new
  settlement yields. Site comparison uses revealed evidence, not hidden AI advice.
- Combat requires current visibility and met hostile identity. Strength/readiness,
  local modifiers and visible terrain defense are separate observations; do not
  sum them into contextual damage. `simulateAttackAsync` is not invoked; expected
  damage/contextual outcome remain unknown. Post-action bounded observation is
  separate from prediction and does not capture all hidden/global effects.
- Promotion prerequisites are passed to native eligibility; AND/OR is not guessed.
  Special land/naval/air/commander/rail actions have distinct guards.

### Diplomacy, trade and turns

- Major `atWar`/`allied` is relative to you. `warOpponents` names other living met
  majors even when not allied; completeness applies only to that filtered roster.
  Native `Diplomacy.isAtWarWith` is used, not stale declaration-event inference.
- Project timing/progress/stage descriptions are native observations, not guaranteed
  expiry/effects. Secondary choices are partial, visibility-safe and owner-qualified.
  Do not sum primary/secondary quotes into an invented total. Unrevealed incoming
  espionage attribution is omitted; revealed reports/sanctions have narrow support.
- Working peace drafts are supported; the general enacted-item schema remains
  unverified. Native INSPECT is a write, never part of the ordinary reader.
- City-state specialization is native, not inferred from its name. Bonus eligibility
  needs pending selection and local suzerainty. A befriending race contains revealed
  local/met participants, not a census of unmet rivals or a guaranteed winner.
- Town focuses have unknown marginal yields. Resource previews never send stateful
  CONSIDER requests. Modern factories/rail indicators are current state, not GDP
  gains or complete network forecasts. Treasure Convoy timers/cargo remain incomplete.
- Route availability is not a specific Merchant's permission. Use exact
  `targetPlayerId`/`targetCityId`; city IDs can repeat across owners.
- `unitOrders.firstReadyUnit` is the native next cycle target, not a complete task
  list. `remainingMovesBlocker` follows the user's cycling preference. Movement
  left alone is not proof of a blocker; unavailable evidence is not an empty list.
- Pending event definition cost is not a final runtime quote. Extended trial/paid
  support is conditional; exact action schemas and loaded evidence take precedence.
  Crisis coverage uses index 0 and does not certify every crisis/DLC variant.

### Victories and Civilopedia

- Culture points are **Tourism totals**, not Culture yield or a per-turn rate.
  Native targets/countdowns are authoritative; don't recompute a global target
  from met rivals alone. Unmet majors have anonymous public totals/countdowns,
  never detailed identities/history/prerequisites.
- Dominance tiers match loaded starting-Age/previous-Age rules. Definition 300
  means 4×, not 3×. Tier percentages are Age progress, not universal turn dates;
  countdowns are conditional, not guaranteed win dates.
- Military `settlementSummary` follows the public screen ledger for local/met
  players, including named fogged settlements and City/Town/capital classification.
  `complete` means ledger resolution, **not independently verified empire census**.
  Missing references/classification make affected totals unknown. Foreign private
  yields, queues, population and locations are not supplied through this summary.
- Culture asset/activation evidence is not evaluated activation, requirement scope,
  qualifying count or marginal Tourism. Unique tags/native quarter recognition and
  historical tracker-family ledger links must not be promoted to exact rule awards.
- `modernProjects` retains native BUILD requirements/mastery/building scope, not
  a complete fastest-win simulator or verified completed-project count.
- Civilopedia: no args lists sections; `query` searches; `section_id` browses;
  exact `section_id`/`page_id` reads the returned article. `limit` is 1–20.
  Check `complete`, `warnings` and chapter availability. Native markup is retained;
  bounded requirement links are **not** a live evaluator (`requirements.complete`
  stays false). Missing content does not prove no requirement; definition prices
  are not runtime quotes. No caller SQL, index initialization or UI navigation.
