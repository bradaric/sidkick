# Sidkick

Sidkick provides read-only-by-default, on-demand game data to AI strategy conversations.
Civilization VII is the first adapter.

## Current modes

- One-shot export supports any loaded save with `--output FILE`; legacy no-argument filenames remain available for the two Catherine Exploration saves.
- OpenCode launches a local MCP server over stdio and manages its process itself.
- The ChatGPT bridge runs a managed tunnel runtime, which launches its own stdio MCP server.
- A standalone HTTP MCP server is available for clients that connect to a URL.

The game adapter connects only to `127.0.0.1:4318`. It reads the local player's empire, decisions, settlements, research and government, religion, resources and trade, units, diplomacy, visible threats, turn context, Test of Time victory progress, and known world. Map queries discard hidden tiles, diplomacy and known-world queries discard unmet players, and threat queries scan only tiles visible this turn. Victory queries include public scoreboard totals/countdowns for anonymous unmet majors, without identities or detailed history. By default it does not poll between tool calls or change game state. An explicit stdio-only write mode adds the typed gameplay actions described below.

## OpenCode: no start/stop wrapper needed

With Sidkick configured as a **local stdio MCP server**, OpenCode launches the Python process when the MCP connection opens, reuses it for tool calls, and stops it when disconnected. This is per connection, not per question. After reboot, open OpenCode in the Sidkick repository and check `/mcps` for the connected Sidkick server. Civ VII must have a save loaded when you request game data.

The configured command is `civ7/.venv/bin/python -m sidkick.server --transport stdio`, run from the repository root. After Python server code or tool registrations change, disconnect/reconnect Sidkick through `/mcps` to load the new code. You do not need to restart Civ VII or the whole OpenCode service.

The ChatGPT bridge scripts below do **not** manage OpenCode's process. Do not start them merely to use Sidkick in OpenCode. The game connection is local, but tool results become part of the conversation sent to your selected AI provider.

### Opt-in gameplay actions (OpenCode first)

The normal server exposes **26 read-only tools**. Starting it with both
`--transport stdio --enable-writes` additionally registers
`select_civ7_technology`, `select_civ7_civic`, `set_civ7_policy_active`,
`assign_civ7_resource`, `move_civ7_great_work`, `buy_civ7_attribute_node`,
`start_civ7_diplomatic_project`, `start_civ7_city_state_project`,
`append_civ7_city_production`, `purchase_civ7_city_item`,
`establish_civ7_trade_route`, `place_civ7_population`, `move_civ7_unit`,
`set_civ7_town_focus`, `upgrade_civ7_town`, `assign_civ7_specialist`,
`set_civ7_unit_order`, `end_civ7_turn`, `choose_civ7_government`,
`choose_civ7_celebration`, `review_civ7_resources`, `acknowledge_civ7_agenda`,
`acknowledge_civ7_advisor_warning`,
`set_civ7_culture_card`, `review_civ7_policies`, `choose_civ7_narrative` and
`respond_civ7_diplomatic_project`, which
**change the loaded game**. The CLI refuses write mode over HTTP. No existing OpenCode configuration or ChatGPT bridge command is
changed automatically; enabling it for a client is a separate deliberate step.
Do not expose FireTuner or an unauthenticated game-control endpoint publicly.

Use a fresh `get_civ7_research_and_government` result to obtain the exact
`technology.available[].id` or `civic.available[].id` and `turn`. The technology action arguments are:

```json
{"technology": "NODE_TECH_TYPE_FROM_THE_READ", "expected_turn": 58}
```

For the civic action, use `{"civic": "NODE_CIVIC_TYPE_FROM_THE_READ", "expected_turn": 58}`.
Each action selects **one offered research node**, not a long-term research
target. It requires an active local turn, no completed-turn submission and no
existing long-term target for that research system. An existing target must be
cleared in the game; these tools will not silently clear it with a second request.
The native check uses the offered node's native numeric selector, not a guessed
hash/index. The expected turn rejects stale turns but cannot detect every
same-turn change or a save switch with identical context markers.

Results distinguish `rejected`, `already_active` (no request),
`verified_applied` (fresh separate readback matched the requested active
technology/civic and turn/Age/player), and `unknown`. After one submission the adapter
checks read-only state at 100 ms intervals for up to two seconds, stopping as
soon as the selection is verified or the context changes. The deadline also
bounds a hanging read. Timeouts/disconnects can still happen after submission,
and the action may apply after the deadline. **Do not automatically repeat unknown or cancelled calls**;
read current research before deciding what to do next. There is no rollback,
cross-process deduplication, or exactly-once guarantee. Actions are serialized
through readback within one server process; use only one write-enabled server
for the game.

This is intended for explicitly authorized single-player commands or bounded
delegated sandbox tasks, not unrestricted unattended play. Ordinary use needs
exact-action instructions; a user's explicit playground delegation can authorize
the agreed disposable-game test scope without per-action approval. MCP
annotations and server instructions are not authorization controls.
The opt-in grants the connected client these twenty-six action capabilities. No
combat, turn advancement, or other write types are included. A live write
needs user authorization; use a disposable save/checkpoint. See the historical
[write-capability investigation](docs/civ7-write-capability-report.md) for the
broader API surface and unverified areas.

**Live verification, 2026-11-05:** two user-approved MCP calls switched Mass
Production to Combustion II and restored Mass Production on turn 58. Fresh reads
observed both selections; Mass Production retained 1,805 progress at depth 0.
No turns were advanced, requests retried, save/load commands issued, or persistent
OpenCode settings changed. Both calls returned `unknown` because the single
immediate readback preceded native application; subsequent read-only checks
confirmed success. The adapter now uses bounded read-only verification to cover
this delay; delayed application, expiration, hanging reads and cancellation are
fixture-tested. An approved repeat of the same two selections returned
`verified_applied` for both calls (about 60 ms each), with the same turn and
1,805 progress restored. A separately approved Political Theory → Samoderzhaviye
→ Political Theory round-trip also returned `verified_applied` for both calls
(about 190 ms and 60 ms). Political Theory retained 2,319 progress at turn 58;
technology and all active policy/tradition/crisis groups were unchanged. The
actions share submission serialization and bounded verification, but have
separate native scripts, selectors and readback fields.

#### Single ordinary-policy toggle

`set_civ7_policy_active` accepts:

```json
{"policy": "TRADITION_TYPE_FROM_THE_READ", "active": false, "expected_turn": 58}
```

Only exact unlocked ordinary-policy IDs are supported. Deactivation can leave
an empty slot and immediately change yields. Activation requires a known empty
**ordinary** policy slot; there is no automatic replacement, tradition-slot
fallback or card migration. The action honors `Culture.canSwapCultureSlot` and
the exact native `CHANGE_TRADITION` check, using the definition's index rather
than its hash. It never clears the policy notification through a separate
`CONSIDER_ASSIGN_TRADITIONS` request and does not edit tradition/crisis cards.

`already_active` and `already_inactive` are no-ops. After submission, verification
requires the exact expected ordinary-card membership and unchanged tradition/
crisis membership in the same turn/Age/player context. Unknown/cancelled results
have the same no-retry rule as research; there is no atomic multi-card swap or
automatic rollback. The live turn-58 preflight reported swapping locked and
native rejection of Social Science removal and Levies activation. Positive
toggle behavior is fixture-tested, not live-certified; an unlocked scenario is
still required. An approved live `set_civ7_policy_active` attempt to deactivate
Social Science returned `rejected` with "Ordinary policy changes are currently
locked"; fresh reads confirmed all slot memberships and both research selections
unchanged on turn 58. No turn is advanced or unlock manufactured to obtain a
positive case.

#### Resources, Great Works and leader attributes

- `assign_civ7_resource(resource_instance, off_map, settlement, expected_turn)`
  assigns one proven-owned resource to an exact owned settlement name with free
  capacity. The map/off-map flag is part of its identity, not inferred from a
  numeric ID. It checks the UI's native resource-assignment lock and operation
  permission. No unassignment, resource swaps, bulk clearing or stateful previews.
- `move_civ7_great_work(great_work_index, destination_city_id,
  destination_building, expected_turn)` moves one owned instance into a compatible
  free owned building slot. City IDs and constructible type IDs come from the
  existing Great Work inventory. It checks unique ownership, slot evidence,
  source/destination damage and native eligibility. Archived works omit
  `SourceCity`; occupied-slot swaps and archiving are unsupported. Yield changes
  are not predicted.
- `buy_civ7_attribute_node(node, expected_turn)` buys a first nonrepeatable leader
  perk by its exact node ID from the local attribute branch. It honors local
  applicability, legend locks, node state, available branch/wildcard funding and
  the native purchase check. This can permanently spend points. Repeat purchases
  are explicitly unsupported; no points are granted or unlocks manufactured.
  Readback verifies the node's depth against its captured pre-submit depth and
  reports the observed balances without inventing an exact price quote.

These actions use the same single-submission, bounded read-only verifier and
return the same rejected/no-op/verified/unknown outcomes. Asset readback is
targeted to the selected resource, work instance or attribute node. Positive and
blocked cases are fixture-tested. First-batch offline verification: **100 Python and
205 Node tests pass**.

**Live verification, 2026-11-05, turn 58:** the approved Pearls instance `531`
assignment to Wak Kab'nal returned `rejected` because resource assignment is
locked. Buying `NODE_ATTRIBUTE_CULTURAL_02` returned `rejected` because no branch
or wildcard points are available. Resource assignment and the selected node's
depth/point balances stayed unchanged. At that checkpoint, positive resource/
attribute execution remained fixture-tested only; a later resource assignment
is recorded below.

The approved relocation of owned Great Work `6` (Exhibit) from St. Petersburg's
Palace to Bàakʼ's Museum returned `verified_applied`; a separate Great Work
inventory read confirmed the Museum location. The work was deliberately left
there for manual inspection, not restored. Research IDs/progress/depth and
policy memberships were unchanged; no turns, save/load commands or write retries
were issued. Manual inspection preceded the first commit. That first batch did
not include diplomacy/city-state actions or city production/purchases.
The user subsequently confirmed in-game that the Exhibit is in Bàakʼ.

#### Diplomacy and city-state project starts

`start_civ7_diplomatic_project(target_player_id, action, max_influence_cost,
expected_turn)` supports Open Borders, Research Collaboration and Cultural
Exchange with met major players. `start_civ7_city_state_project` accepts the same
arguments for Promote Growth, Bolster Military and Incorporate with met
city-states. Use exact `DIPLOMACY_ACTION_*` IDs from the corresponding read tool.
Incorporation additionally requires local suzerainty; it starts a project that
permanently adds the city-state as a town on completion, not immediate annexation.

Both tools select a unique offered native project, require no secondary target,
check the selected primary target's failure reasons and Influence quote against
the explicit cap and balance, and perform the exact native operation check.
Zero-cost quotes remain zero; missing costs are not free. Native quick-start
arguments include both `Player2` and `ID`. The matched project's native
`operationType` is retained: incorporation does not use the same operation as
ordinary diplomatic projects. No raw operation dispatcher, wars, espionage,
working deals, levying, independent befriending, bonus selection, support/response
actions, cancellation or turn advancement is included.

The cap is checked against the selected-target quote immediately before native
submission; this is not an atomic engine transaction or a guarantee against
another writer changing game state. Only one request is submitted. Verification
passes captured pre-submit own-event IDs into a targeted read and requires
exactly one new, matching local-initiated, same-turn, nonfailed ongoing record.
Old IDs, incoming/foreign/unrelated projects and ended/failed records cannot
prove a new start. IDs, observed progress, native remaining-turn quotes and
Influence balances are returned without claiming eventual acceptance, completion
or a guaranteed outcome. Existing matching ongoing projects are no-ops; uncertain
results retain the no-automatic-retry rule.

Second-batch verification: **105 Python and 219 Node tests pass**. Read-only turn-58
preflight offered Research Collaboration with Hatshepsut for 150 Influence,
Promote Growth in Kutaraja for 90, and Incorporate in Kumasi for 720. Live calls
are separately approved and paused after each successful start for manual
inspection; this batch is kept separate from the first write-support commit.
The native picker can include an active row for another counterpart alongside
an available start row (observed with Hanseong versus Kumasi incorporation).
Uniqueness is checked among available start rows, not the entire action-type
list. A preflight initially rejected this mixed list without sending a native
request or spending Influence; the source-backed distinction is regression-tested.

**Live verification, 2026-11-05, turn 58:** after correcting that start-row
selection, the separately approved Kumasi incorporation request submitted once
and returned `verified_applied`. A distinct local-initiated project `72` appeared
for Kumasi with native progress `0/10` and 10 turns remaining. Independent
city-state readback confirmed the running project and Influence fell from
1194.82421875 to 474.82421875, an observed cost of 720. Kumasi remains a city-state
while incorporation runs; no annexation, turn advancement or cancellation was
performed. The user subsequently confirmed Kumasi's project in-game.

The next separately approved call started Research Collaboration with Hatshepsut
(player `3`) for 150 Influence and returned `verified_applied`. Independent
diplomacy readback found project `73`, response `DIPLOMACY_RESPONSE_ACCEPT`,
progress `0/15` and a native quote of 15 turns remaining. Influence fell from
474.82421875 to 324.82421875; turn/Age/player identity stayed unchanged at turn
58. The user subsequently confirmed this collaboration in-game.

The final approved call started Promote Growth in Kutaraja (player `7`) for 90
Influence and returned `verified_applied`. Independent city-state readback found
project `74`, native progress `0/10` and 10 turns remaining. Influence fell from
324.82421875 to 234.82421875, with turn/Age/player identity still unchanged at
turn 58. All three approved project starts are now live-verified and manually
confirmed by the user, including the final Kutaraja inspection. No turn
advancement, project cancellation or additional write calls are queued.

#### Append-only city production and city/town purchases

- `append_civ7_city_production(settlement, item, expected_turn, x=None, y=None)`
  appends one exact unit, building or project type ID in an owned city. Uses
  explicit native `InsertMode: Append`, never the default insertion behavior,
  replacement, deletion or reordering. Town production/focus changes are excluded.
- `purchase_civ7_city_item(settlement, item, max_gold_cost, expected_turn,
  x=None, y=None)` buys one unit or building in an owned city or town. It uses
  the native purchase command's exact `Cost`, rejects missing/over-cap quotes
  and insufficient Gold, and preserves zero/fractional costs. Purchases create
  assets and can add upkeep. Projects and town-to-city upgrades are excluded.

The settlement is an exact displayed name (case-insensitive); the item is an
exact type ID from `get_civ7_available_decisions`. Both handlers require an
active local turn and exact native permission. Buildings additionally require
both x and y from `get_civ7_building_placements`, an explicitly revealed native
legal plot, and a placement preview whose overbuilt ID is `-1`. Omit coordinates
for units/projects. No wonders, repairs, purchases of queued/in-progress items,
overbuilding or automatic tile selection are supported.
Building validation uses two native checks: the coordinate-free result supplies
`Plots`/`ExpandUrbanPlots` for tile membership, then the X/Y-specific result must
permit the exact tile and supplies the purchase cost. The latter can omit plot
lists; requiring them again incorrectly rejects a legal placement. Both checks
must pass, with the same no-overbuild, queue and budget guards retained.

Each handler submits once, then polls targeted read-only state with captured
pre-submit queue and owned asset identities. Append verification requires the
complete original queue prefix and exactly one matching new tail (including the
building tile). Purchase verification requires an unchanged queue and exactly
one new matching owned unit component ID, or a new undamaged building component
in the selected settlement at the exact tile. Gold loss alone is never proof.
Unit IDs are compared across the local player's matching-type inventory; their
observed spawn location is returned, not assumed to be the city centre. Native
balance changes are observations, not an atomic cost guarantee. Another writer
can still race submission/readback or confound asset attribution; use one writer,
and never automatically retry an unknown/cancelled call.

Production/purchase verification: **110 Python and 235 Node tests pass**. Positive
building/project appends and all purchase types are fixture-tested. Separately
approved turn-58 live tests are a Scout append after Copan's Department Store,
a Merchant purchase in Copan (320 Gold cap), a Scout purchase in Roskilde (120),
and a no-overbuild Fishing Quay purchase in Roskilde at `(24,4)` (220). Native
read-only preflight confirmed the append operation and Quay placement.

**Live verification, 2026-11-05, turn 58:** the approved Scout append in Copan
returned `verified_applied`. Targeted native readback preserved the complete
Department Store queue entry and added exactly one Scout after it. Independent
settlement readback confirmed Department Store (6 turns), then Scout (1 turn).
Gold remained 1870.58984375 and turn/Age/player identity was unchanged. The user
subsequently confirmed the queue in-game.

The next approved call purchased one Merchant in Copan for 320 Gold and returned
`verified_applied`. Independent unit readback confirmed new owned instance
`3473432` at `(26,12)`. Gold fell from 1870.58984375 to 1550.58984375, with the
Department Store → Scout queue and turn/Age/player identity unchanged at turn 58.
The user subsequently confirmed the Merchant and manually sent it toward Delhi.
At turn 58, the approved Roskilde Scout and Fishing Quay purchases remained
pending. No queue replacement, turn advancement or retry was performed by these tools.

**Live verification, turn 59:** after refreshing eligibility and the approved
120 Gold cap, the Roskilde Scout purchase returned `verified_applied`. Independent
unit readback confirmed new owned Scout `3670032` at `(24,5)`. Gold fell from
1394.27734375 to 1274.27734375, and Roskilde's empty queue and turn/Age/player
identity stayed unchanged. The user subsequently confirmed the Scout in-game.

The first Quay attempt stopped at the adapter's plot guard without a native
request or Gold spend. Read-only diagnosis found that the general check listed
plot `320` (`24,4`) in `ExpandUrbanPlots`, while the selected-tile check returned
`Success: true`, `Cost: 220` and no plot lists. The separately approved two-stage
guard fix was reproduced in a failing regression before implementation; tests
also retain general-plot rejection and selected-tile permission/cost checks.

After that correction, the approved Quay purchase submitted once and returned
`verified_applied`. New undamaged building component `17367264` appeared at
`(24,4)` in Roskilde; independent settlement readback confirmed the Fishing Quay.
Gold fell from 1274.27734375 to 1054.27734375, with no overbuilding, queue change
or turn/Age/player change. No native submission was retried. All approved live
production/purchase/trade tests have now succeeded and been manually confirmed by
the user, including the final Quay inspection.

#### Merchant trade-route establishment and dispatch

`establish_civ7_trade_route(unit_id, target_player_id, target_city_id, expected_turn)`
uses an exact owned Merchant instance and owner-qualified foreign city identity.
Target IDs can come from `get_civ7_known_world.visibleForeignSettlements`
(`ownerId`, `cityId`). It requires an active local turn, met peaceful counterpart,
revealed target city, unique available projected route, known unpacked on-map
Merchant. Like the native chooser, it checks `MAKE_TRADE_ROUTE` first; if that
command is unavailable, it supports **Send Merchant** in single-player: one native
nonattack `MOVE_TO` toward the nearest reachable revealed plot belonging to that
city. Native movement permission, war/combat and confirmation checks still apply.
There is no independent movement-points gate: zero movement alone does not prove
either branch is unavailable. The command may use the Merchant's action/charges
and change trade/resource access. Existing routes are no-ops.

Exactly one command **or** move is submitted, never both. Dispatch may replace a
previous order and queue travel across later user-advanced turns. This is not a
guarantee of safe travel, arrival or automatic route establishment; the tool never
advances turns or submits a follow-up command. Unknown/cancelled outcomes must
never be retried automatically.

The bounded read-only verifier polls for up to 15 seconds. Readback requests
`INCLUDE_FAILED + EXTENDED_STATUS`,
as the native commerce screen does, and requires the exact target to become
`ALREADY_EXISTS`, with total routes and routes to that counterpart each rising by
exactly one from captured counts. Merchant disappearance, movement consumption,
or a counter increase alone cannot establish a route. `outcome: route_established`
is the only active-route success. Dispatch instead reports
`merchant_move_order_observed` (`status: submitted`, `queuedTargetVerified: false`)
or `merchant_moved_route_not_active` (`status: verified_partial`). The queue API
cannot verify its exact destination. No observed change before timeout is
`unknown`, not permission to retry. Another writer can confound these observations;
there is no atomic submission or cross-process deduplication.

Send Merchant is source/fixture-tested, including purchase-turn zero-movement
dispatch; it has not been live-verified. No live probes or game actions were
issued for this change while the user played in another session. The direct-only
native evidence below is historical, not a current eligibility rule.

Dispatch regression verification: **273 Python /495 Node tests pass**.

Production/purchase/trade regression verification: **114 Python and 242 Node tests pass**. The
separately approved live test buys a second Merchant in Kyiv for at most 400 Gold
and attempts a direct route to Samapa (player `5`, city `65536`, at `(18,39)`).
Native read-only extended-status evidence offered that target with `SUCCESS` on
turn 58. The first Merchant (`3473432`, Delhi-bound) is excluded from this test.

**Live verification, 2026-11-05, turn 58:** the approved second Merchant purchase
in Kyiv returned `verified_applied`, creating instance `3538953` at `(23,38)`.
Gold fell from 1550.58984375 to 1150.58984375 (400 spent); Kyiv's queue remained
empty. The subsequent direct Samapa attempt returned `rejected` at native
`canStart`, with no failure reasons supplied. No trade-route request was sent.
The new Merchant remained at `(23,38)` with 0 movement remaining; that is observed
state, not proof of the native rejection's cause. Extended-status readback kept
Samapa inactive, total routes at 2 and Mughal routes at 0. At this point positive
direct route execution/readback remained fixture-tested only.

The original Delhi-bound Merchant's location and movement were unchanged. No
movement fallback, retry or turn advancement was issued. Testing initially paused
for manual inspection before the remaining Roskilde purchases.

**Live verification, turn 59:** after the user manually advanced the turn, the
same Kyiv Merchant had 4 movement and native checks permitted all four tested
destinations (Samapa, St. Louis, Lahore and Kumasi). The user selected Samapa.
One `establish_civ7_trade_route` call returned `verified_applied`: extended-status
readback marked Samapa active, total routes rose from 2 to 3 and Mughal routes
from 0 to 1. A separate targeted read confirmed those changes; the Merchant
`3538953` was no longer in the owned unit roster. Turn/Age/player identity stayed
unchanged during the call. No movement fallback, retry, other Merchant command
or assistant-issued turn advancement occurred. This positively live-verifies
direct establishment and its bounded readback; the earlier rejection supplied
no native reason, so its precise cause is not asserted. The user subsequently
confirmed the Samapa route in-game.

#### Pending population and adjacent noncombat movement

- `place_civ7_population(settlement, x, y, improvement, expected_turn)` consumes
  one ready pending population on an exact native-offered improvement tile in an
  owned city/town. The improvement is an exact type ID from the legal expansion
  options in `get_civ7_growth`, not the separate improvement previews. Requires
  an empty revealed nonforeign tile, unique general `EXPAND` plot/improvement
  pairing and a successful selected-tile native check. No specialists, occupied
  tile replacement, unique-improvement preview placement or resettlement.
  Readback requires one fewer pending population and a genuinely new owned,
  undamaged improvement at the exact tile. Existing tile ownership is not proof:
  the approved Hanseong tile was already within its purchased territory.
- `move_civ7_unit(unit_id, x, y, expected_turn)` now uses normal native land/sea
  movement, including fog/unexplored targets, native shore/access rules and queued
  continuation. It no longer requires adjacent, visible, empty path tiles or
  positive movement just to queue a destination. Uses the native fog modifier
  without `ATTACK`, never the attack/swap/war UI helper. Native permission,
  confirmation/war, ownership/context and visible-combat checks remain. Arrival,
  observed partial movement and queued intent are reported separately; see
  **Normal movement and exploration** below. No turn is advanced automatically.

Both tools remain stdio-write-opt-in only and submit once using the existing
bounded verifier. Unknown/cancelled outcomes must not be automatically retried;
same-turn races/save switches are not atomically excluded. Current verification:
**118 Python and 253 Node tests pass**. Default stdio still discovers 23 read-only
tools; write mode discovers 36 tools (13 actions). Land, naval and already-embarked
movement are fixture-tested; the embarked Scout and population placement are
additionally live-verified below.

Separately approved turn-59 live tests: place Hanseong's pending population on
Fishing Boat `(12,37)` (native preview +1 Food, +1 Production, +1 Science); assign
new Whales `2976`, map identity, from Samapa to Ur's empty resource slot using the
existing assignment tool; move Scout `196610` from `(9,15)` to `(10,15)`. Read-only
preflight confirmed pending population, the offered improvement, assignment
unlocked/native permission and the empty visible adjacent noncombat destination.
Each successful write was paused for manual inspection. Remaining action types
and their implementation priority are a separate discussion after these checks.

**Live verification, 2026-11-05, turn 59:** the approved Hanseong placement at
`(12,37)` returned `verified_applied`. New undamaged Fishing Boat component
`17432801` appeared at that exact tile, and pending population fell from 1 to 0.
Independent growth and settlement reads confirmed both changes. Total population
remained 5: consuming a pending placement is not an additional population grant.
The engine's pre-submit preview reported +1 Food, +1 Production and +1 Science;
those are preview effects, not a reconstructed empire-wide marginal yield.
Turn/Age/player identity stayed unchanged, with one native submission and no
retry. The user confirmed the Fishing Boat and reported about three additional
border tiles. The installed Civilopedia confirms that population placement also
claims eligible adjacent tiles. No complete pre-placement border snapshot was
captured, so that exact territorial delta is user-observed, not independently
verified or reported by the current handler.

The approved resource call then assigned Samapa Whales `2976` (map identity) to
Ur and returned `verified_applied`. Native readback changed its assignment from
none to owned city `524295`; independent commerce readback confirmed Whales in
Ur with slots used `0 → 1` and no free slots remaining. This positively
live-verifies the existing assignment tool with the assignment lock open.
Turn/Age/player identity stayed unchanged at turn 59, with one request and no
retry or resource swap. The user subsequently confirmed Ur's assignment in-game.

The first Scout attempt stopped before submission at an overly strict domain
guard: Scout `196610` has `DOMAIN_LAND` but was already embarked, on Coast at
`(9,15)`, with an Ocean destination `(10,15)`. Both tiles were water and native
`MOVE_TO` permitted the step. The separately approved fix allows water-to-water
travel while already embarked; a failing regression reproduced the rejection
before implementation, while embark/disembark and unknown-terrain cases remain
blocked. No movement was spent by the rejected attempt.

The corrected, separately approved step submitted once and returned
`verified_applied`. Targeted native and independent unit readbacks confirmed
the same owned Scout/component/type at `(10,15)`, with movement falling from
3 to 2. Turn/Age/player identity remained unchanged at turn 59. No attack, swap,
war declaration, native submission retry or turn advancement was issued. All
three approved actions are now live-verified and manually confirmed, including
the final Scout inspection.

#### Town focus, city upgrades and specialists

- `set_civ7_town_focus(settlement, focus, expected_turn)` uses an exact offered
  `PROJECT_TOWN_*` ID or `GROWTH`. Uses the UI's project hash and exact native
  town command; changes food export/yields and can stop ordinary growth.
- `upgrade_civ7_town(settlement, max_gold_cost, expected_turn)` uses the native
  `ORDER_TOWN_UPGRADE` purchase directive, the UI's current town upgrade quote
  and an explicit Gold cap. It permanently changes the same owned town into a
  city. Already-city targets are no-ops. The native upgrade may create a pending
  population placement; this tool does not silently choose it or production.
- `assign_civ7_specialist(settlement, x, y, expected_turn)` spends one ready
  pending population in an unblocked, nonfull owned city slot. Uses the exact
  `ASSIGN_WORKER` location/amount command and verifies that tile's worker count
  rises by one while pending population falls by one. No worker removals or town
  specialists. Read `get_civ7_growth` for the current food/happiness upkeep preview.

All three use fixed scripts, strict selectors, native eligibility and the shared
single-submission bounded verifier. Default stdio remains 23 read-only tools;
write mode exposes 39 tools (16 actions). **122 Python and 259 Node tests pass.**

**Playground verification, 2026-11-05, turn 59:** a separate native local save
`Sidkick_Playground_Baseline_T59_1793918023366` completed with serializer result
`RESULT_OK`, without overwrite. Roskilde's Mining → Growing → Mining focus
round-trip returned `verified_applied` twice; the repeated Mining call was a
no-op. An upgrade at the normal balance of 1054.27734375 Gold was rejected.

**Synthetic prerequisites, not normal-play earning/growth:** the authorized
private debug setup granted 10000 Gold and one rural population to Copan. Separate
readback confirmed Gold 11054.27734375 and Copan pending population 1 (immediate
same-script getters were stale). Then the normal typed upgrade handler spent
3400 Gold and converted Roskilde to a city, leaving 7654.27734375 Gold. Native
upgrade readback also exposed one new pending population. The normal typed
specialist handler assigned Copan `(25,11)`, workers 0 → 1 and pending 1 → 0.
Both returned `verified_applied`; independent decisions/growth reads confirmed
the new city and specialist. These establish normal native action execution with
debug-created prerequisites, not naturally earned eligibility. No turn advanced.

The agreed backlog and ongoing results are in
[`docs/civ7-action-backlog.md`](docs/civ7-action-backlog.md).

#### Advisor-warning acknowledgement

`acknowledge_civ7_advisor_warning(notification_id, component_type, expected_turn)`
acknowledges one owned military, culture, economic or science advisor warning.
Use the exact `id.id` and `id.type` from
`get_civ7_turn_context.notifications[]`, not a label or list index. A Tourism
warning is supported when its native type is `NOTIFICATION_ADVISOR_WARNING_CULTURE`;
the tool does not infer notification types from their displayed text.

This follows the native advisor handler's `VIEWED_ADVISOR_WARNING` operation with
`{Target: notificationComponent}` after the native permission check. It never
uses generic `Game.Notifications.dismiss`, which is not a substitute for advisor
acknowledgement. It requires a started single-player active turn and rechecks the
exact notification identity, warning contents and turn/Age/player before sending
once. Other notification types, ambiguous/unknown records, stale identities and
confirmation requirements reject. Already dismissed/expired warnings are no-ops.

Readback polls for up to 15 seconds for that notification to be dismissed, expired
or removed. This verifies notification clearance, not popup UI closure or resolution
of the underlying military/Tourism problem. No advisor settings, resources, rewards,
other choices or turns are changed. Unknown/cancelled outcomes are never automatically
retried. Reconnect the MCP server when idle to load the new tool registration.

Verification is source/fixture-only: no live probes, warnings acknowledged or turns
advanced. **278 Python /502 Node tests pass**. Tool counts are
**25 default /131 opt-in (106 actions)**. Native reference:
`base-standard/ui/notification-train/notification-handlers.js`,
`AdvisorWarning.dismiss`; the Watch Out popup uses that handler for its Dismiss button.

#### Everyday unit orders and guarded turn completion

- `set_civ7_unit_order(unit_id, order, expected_turn)` supports `skip`,
  `sleep`, `wake`, `fortify`, `heal`, `alert`, `cancel` and Scout-only `auto_explore`. Uses native non-target
  operations/commands and verifies current activity/operation, not eventual
  healing or future defense bonuses. Existing queues require explicit cancel or
  wake, except an explicit Scout auto-explore order can replace its old order if
  the native check allows it. No raw operation IDs, attacks or disbanding are exposed.
- `end_civ7_turn(expected_turn)` requires a verified single-player active local
  turn, no native blockers and no ready unit needing an order. Submits once and
  polls for at most 60 seconds for exactly the next active local turn, same Age
  and player. It never forces completion, ignores blockers or makes pending
  choices. New blockers or timeout can leave the result `unknown`; inspect fresh
  state before proceeding, never automatically retry. Unsupported Age/endgame
  boundaries remain separate work.

Default mode still exposes 23 read-only tools; write mode has 41 tools, including
18 actions. **128 Python and 265 Node tests pass.**

**Live playground verification, 2026-11-05, turns 59–60:** native wake, sleep,
cancel, skip, fortify and alert verified through the typed MCP handler. A Scout
skip initially returned `unknown`: stable native activity is `HOLD`, no queued
operation, and movement remains. Fresh read-only evidence resolved the effect;
the verifier was regression-tested and corrected without repeating that skip.
Heal has fixture coverage only; no eligible damaged unit was used.

The turn guard rejected real population, production and resource-review blockers.
Roskilde's upgrade-created population was placed on Pearls `(26,8)` and a Scout
was queued through existing typed tools. A private contract probe submitted the
UI's native `CONSIDER_ASSIGN_RESOURCE` review operation; it did not force or
dismiss a blocker. Typed review support is still pending. The first unblocked
turn request exposed two newly ready ships and remained on turn 59, correctly
returning `unknown` after bounded polling. Fresh readback confirmed the state;
after explicit skip orders for both ships, a new guarded request returned
`verified_applied`: turn **59 → 60**, same player/Age, active local turn, no sent
completion. Turn 60 now requires a diplomatic response; no automatic response
or further turn submission was made. This remains the sandbox with Batch 1's
debug Gold/population setup, not an unmodified campaign replay.

#### Government, celebration and review prompts

- `choose_civ7_government(government, expected_turn)` requires an exact
  current-Age picker ID plus a pending government notification or no selected
  government, then uses the UI's definition **index**, not its hash. Verifies the
  selected government and cleared pending flag. No mid-Age arbitrary switching.
- `choose_civ7_celebration(celebration, expected_turn)` requires an exact native
  offered choice, `Happiness.canChoose()` and native permission. Verifies active
  selection and cleared pending choice; does not manufacture eligibility.
- `review_civ7_resources(expected_turn)` mirrors closing the native resource
  review screen: `CONSIDER_ASSIGN_RESOURCE` with empty arguments. Requires a
  pending local resource-review notification and verifies it clears; no resource
  assignments, arbitrary dismissals or turn completion.
- `acknowledge_civ7_agenda(notification_id, expected_turn)` mirrors closing one
  exact owned agenda popup. Only `NOTIFICATION_DIPLOMATIC_ACTION_AGENDA` is
  supported; it cannot dismiss a government/policy picker or answer a proposal.
  Verification uses captured notification ID/component type, not the overall
  blocker, which could be masked by another pending choice.

Default mode remains 23 read-only tools; write mode has 45 tools, including 22
actions. **132 Python and 272 Node tests pass.**

**Live playground verification, turn 60, 2026-11-05/06:** exact agenda message
`288` acknowledged once and verified dismissed. Unselected celebration was
rejected because no choice was pending; current-government and already-reviewed
resource calls were no-ops. Government's first preflight found native
`GameInfo` collections do not implement `some`; it submitted nothing. A fixture
now models this and the handler uses supported `filter` instead. No government
change, celebration selection or typed positive resource review is claimed yet.

A separate save `Sidkick_Playground_BeforeChoices_T60_1793919586400` completed
with `RESULT_OK`, without overwrite. An authorized private no-argument
`Happiness.startGoldenAge()` debug probe had **no observed effect** on active,
pending or remaining-turn state; it is not counted as eligible picker coverage.
Government/celebration successful submissions remain fixture-only until a genuine
or demonstrably debug-created native pending case is available. Project/deal
responses, tradition/crisis slots and narrative choices remain separate work.

#### Explicit policy, tradition and crisis card groups

`set_civ7_culture_card(card, active, slot, expected_turn)` supports exact local
unlocked cards in `policy`, `tradition` or `crisis` groups. Native card commands
have no slot parameter: this tool therefore only submits placements with a
deterministic destination. Ordinary cards enter ordinary slots first, or a free
tradition slot only when ordinary slots are full. Tradition/crisis cards use
their own group. Full slots, implicit migrations, duplicate inventories and
unexpected group changes are rejected; all three active inventories are verified.
Removal must name the card's current group. Explicit remove/add calls can replace
cards, but are **not atomic**: removal can succeed while a later addition fails.
No bulk replacement or Gold-paid swap-window purchase is included. The narrower
`set_civ7_policy_active` remains available for ordinary slots only.

`review_civ7_policies(expected_turn)` mirrors closing the native policy screen
through `CONSIDER_ASSIGN_TRADITIONS`, checking its specific reminder clears.
It changes no cards; optional slots may remain empty. Native permission is still
required, and unrelated mandatory choices are never dismissed.

Default remains 23 read-only tools; write mode has 47 tools (24 actions).
**135 Python and 277 Node tests pass.**

**Live playground verification, 2026-11-06, turn 60:** Civil Engineering entered
the free tradition slot while ordinary slots were full, then was removed; Pet Kot
was placed in that tradition slot. All three calls verified the complete expected
inventories without moving other cards. The original ordinary-policy handler also
verified a Living Standards off/on round trip, closing its earlier positive live
coverage gap. The pending policy review then cleared through the typed review
handler. Crisis cards remain fixture-only (Modern currently has zero crisis slots).

St. Petersburg's naturally pending turn-60 population was assigned as a specialist
at `(18,9)`, workers 0 → 1, pending 1 → 0. Unlike Copan's debug-created case, this
population became ready through ordinary turn advancement, although this is still
the modified playground campaign. Globalism was selected as the next civic. No
additional turn was submitted in this batch; the remaining blocker is unit orders.

#### Pending narrative/discovery/crisis choices

`choose_civ7_narrative(instance_id, instance_type, choice, expected_turn)` selects
one exact owned pending instance from `get_civ7_turn_context`. It reconstructs
the native regular/graphic event's offered links, including variable order and
requisite filtering, and requires exact native operation permission. `CLOSE` is
allowed only when there are no eligible links, not when a paid choice is merely
unaffordable. Currently only definition `Cost === 0` choices are supported;
runtime cost quotes and trial-specific handling are not established. Scripted
rewards or negative consequences can still be permanent. Verification proves the
submitted instance left the pending queue, **not** each reward or side effect.

Default remains 23 read-only tools; write mode has 48 tools (25 actions).
**138 Python and 281 Node tests pass.**

**Live playground verification, 2026-11-06:** a nonpending `210A` instance was
rejected. Separate native save
`Sidkick_Playground_BeforeNarrative_T60_1793920224440` confirmed `RESULT_OK`, no
overwrite. A private debug `Stories.onRequirementsMet(componentId)` probe on
instance `237` had no observed effect: that story stayed in its original state
and no pending event appeared. It is not counted as successful synthetic setup.

After explicit unit skip orders, one typed end-turn request from turn 60 observed
turn **62**, not exactly 61, and returned `unknown` without retrying. Fresh read
confirmed active turn 62; the cause of the extra advancement is unresolved.
Auto-end-turn was observed **off**. No further end-turn requests were made.
Hatshepsut's completed cultural victory is reported by the native victory query;
no `EXTEND_GAME`/One More Turn request has been issued. A celebration notification
existed, but native state reported an active Elective Republic celebration with
`canChoose() === false`. This is not proof of the typed selection handler; the
earlier debug probe's eventual influence on that state is uncertain.

Turn 62 offered normal pending archaeology event `ARCHAEOLOGY_14A` at Thera,
instance `(owner 0, id 223, type 35)`. Its native `CLOSE` choice returned
`verified_applied`; independent turn-context read confirmed the exact instance
was no longer pending. The displayed reward was +1 Artifact, but no independent
before/after artifact inventory was captured, so the reward is not separately
claimed. Linked-choice and crisis-event positive execution remains fixture-only.

#### Responses to incoming cooperative projects

`get_civ7_diplomacy` now includes `responseOptions` for visible incoming projects
awaiting a response: native descriptions, Influence quotes, selectability and
exact-operation eligibility. Missing costs stay unknown. Hidden/unrevealed
incoming events are still excluded before detailed reads.

`respond_civ7_diplomatic_project(action_id, response, max_influence_cost,
expected_turn)` supports `accept`, `support` or `reject` only for incoming Open
Borders, Research Collaboration, Cultural Exchange and Local Festival from met
peaceful major leaders. It proves local-target event provenance before querying
the native response picker, checks the selected quote/cap/balance and exact
`RESPOND_DIPLOMATIC_ACTION` permission, then rechecks identity and quote. No wars,
military demands, espionage, deals, outgoing-event support increments or changing
an existing different response. Rejection can worsen relations/impose cooldowns;
support spends Influence. Readback verifies the same event's recorded response,
not promised yields or eventual completion.

Default remains 23 read-only tools; write mode has 49 tools (26 actions).
**141 Python and 287 Node tests pass.**

**Live playground verification, 2026-11-06, turn 62:** José Rizal's incoming
Cultural Exchange event `76` offered Support 180, Accept 0 and Reject 60 Influence.
A cap of 179 was rejected without submission. Support with cap 180 returned
`verified_applied`; the same event recorded `DIPLOMACY_RESPONSE_SUPPORT` and
Influence fell from 564.82421875 to 384.82421875, exactly 180. Independent diplomacy
read confirmed the response. Accept/reject have fixture coverage, not positive
live execution. No additional turn was advanced or post-victory continuation
requested; the previously observed turn-boundary anomaly remains unresolved.

#### Celebration readiness correction (2026-11-06)

Morning UI verification found a genuine CHOOSE_GOLDEN_AGE prompt while
`Happiness.canChoose()` was false and a default/current celebration was active.
The native picker still offered and accepted the Science choice, clearing its
notification, completing Combustion II and adding an ordinary policy slot. This
was normal UI execution, not positive typed-handler coverage. The action,
targeted verifier and readout now accept an owned, live celebration notification
as pending evidence, alongside the native canChoose flag. Active/current selection
alone never proves that a pending choice was resolved. Exact offered-choice and
native permission checks remain required; foreign, expired or dismissed
notifications cannot authorize a choice. **141 Python and 289 Node tests pass.**
The already-completed choice was a verified no-op with the corrected handler;
another pending case is needed for positive typed live coverage.

#### Earned unit promotions

`promote_civ7_unit(unit_id, discipline, promotion, expected_turn)` requires exact
IDs from `get_civ7_units`, a unique owned deployed unit with no queued order,
membership in its native promotion-class/discipline tree, native picker eligibility
and exact PROMOTE permission. It verifies that promotion was acquired on the same
unit and returns point balances; no experience grants, automatic choices or
predicted combat results are exposed. Unit readouts now include exact discipline
IDs and acquired-promotion IDs as well as localized names.

Default remains 23 read-only tools; write mode has 50 tools (27 actions).
**144 Python and 293 Node tests pass.** Live native Initiative acquisition on
commander 65536 verified, with promotion points 1 → 0. Eligibility was synthetic:
the private authorized debug setup granted 41 XP (level 2 → 3), not combat-earned
experience. The reviewed morning state is separately preserved in native save
`Sidkick_Playground_ReviewedMorning_T62_1793948595702` (RESULT_OK, no overwrite).

#### Capped individual unit upgrades

`upgrade_civ7_unit(unit_id, target_unit_type, max_gold_cost, expected_turn)`
requires an owned deployed unqueued unit, exact native target and direct loaded
upgrade link. The native command exposes its price only in AdditionalDescription:
the tool accepts only the exact observed English `Upgrade to <name>: <integer>
[icon:YIELD_GOLD] Gold` format, with one description and a safe integer amount.
Missing, localized, grouped-number, ambiguous or changed quotes are rejected,
not estimated. Exact native permission/quote is refreshed before submission;
cap, Gold balance, identity, tile and active turn are checked. The unit readout
now exposes this target/quote and withholds availability for unsupported prices.

Upgrades can replace the native instance ID. Readback therefore captures all
pre-existing owned IDs and source tile: it requires either the original unit's
type to change or its disappearance with exactly one new target unit at that
tile, plus the exact quoted Gold spend. A transient disappearance is polled,
not treated as failure; pre-existing target units and ambiguous replacements
cannot prove success. Unknown outcomes are never resubmitted.

Default remains 23 read-only tools; write mode has 51 tools (28 actions).
**147 Python and 299 Node tests pass.** Native T62 verification: Cuirassier
1310739 → Landship 3801103 at `(12,17)`, 200 Gold. The first verifier conservatively
returned unknown because the ID changed; read-only evidence resolved the effect,
without repeating the upgrade. A distinct Cuirassier 1376276 → Landship 3866637
at `(24,18)` then returned `verified_applied` with the corrected verifier, another
200 Gold. Cap 199 was rejected. Prerequisite movement was restored through the
authorized private debug API; these are normal native upgrades with synthetic
movement readiness, not naturally refreshed-turn coverage. No turn advanced.

#### Commander packing and deployment

`pack_civ7_commander(commander_id, expected_turn)` is explicitly the native
**pack all eligible nearby friendly units** command, including eligible civilians
where the engine allows it; it is not per-unit selection. It requires a unique
owned deployed unqueued commander, owner-qualified army identity, known packed
membership and exact native permission. Readback requires newly packed members
from the captured own inventory while preserving existing packed members.

`unpack_civ7_commander(commander_id, x, y, expected_turn)` requires a currently
visible owned plot offered by the native picker, followed by exact selected-plot
permission. The engine places individual units. Readback requires all captured
packed members to be deployed and membership empty; partial deployment remains
unknown and is never automatically repeated. No reinforcement/transport/attacks
or raw command dispatcher is included. Targeted `get_civ7_military_logistics`
now exposes pack permission and checked visible-owned unpack options.

Default remains 23 read-only tools; write mode has 53 tools (30 actions).
**150 Python and 304 Node tests pass.** Native T62 commander 65536 packed Rifleman
3080232, membership `[] → [3080232]`; typed unpack at `(28,30)` verified membership
empty and Rifleman deployed. Independent read confirmed `isPacked=false` and one
movement remaining; the existing typed ordinary movement handler then verified a
land step `(28,30) → (27,30)`. Commander/member movement was debug-restored before
the test; normal native action execution is distinguished from synthetic movement
readiness. Initiative came from the prior synthetic-XP test. No turn advanced.

#### Reinforcement assignments

`reinforce_civ7_unit(unit_id, commander_id, expected_turn)` starts native travel
for a deployed packable non-commander to a specific owned deployed unqueued
commander on a currently visible owned plot. It requires known own packed
membership, no existing different reinforcement assignment, a native offered
destination and exact selected-plot permission (including full movement). It
does not recruit, redirect, advance a turn or predict a safe route. The unit may
leave the map; readback verifies its owner-qualified native assignment to the
captured army and reports a native ETA when available, **not completed arrival**.

Default remains 23 read-only tools; write mode has 54 tools (31 actions).
**153 Python and 307 Node tests pass.** Live T62: a separate test Rifleman was
normally purchased in Copan for 1085 Gold under the native quote/cap, creating
3932172. Native reinforcement correctly rejected its zero movement. After private
debug restoration of full movement, the typed operation assigned it to commander
65536's army and returned `verified_applied`, native ETA 9. Independent logistics
read confirmed the same assignment with location withheld while travelling.
Readiness was synthetic; arrival has not been tested. Gold is 6921.33984375;
the original reviewed checkpoint remains separate. No turn advanced.

#### Single-unit field combat

`attack_civ7_unit(unit_id, target_player, target_unit_id, x, y, kind, expected_turn)`
supports one explicit `melee` or `ranged` attack in an **existing war** against a
single currently visible enemy combat-formation unit on an owned/unowned field
tile. Exact owner-qualified defender IDs are now in `get_civ7_combat_options`.
The attacker must be deployed, unqueued, unpacked, nonreinforcing, noncommander,
land/sea, not embarked and ready. Melee requires an adjacent native attack target
and melee combat test; ranged requires an attackable native picker plot. Both
use exact native permission, fresh identity/health/turn checks, and fixed operation
arguments, not the UI helper that can declare war or swap targets.

Enemy territory, defensible districts, stacks, civilians (including native combat
components on civilian formations), commanders, air/embarked attacks, declarations
of war, captures and confirmation bypasses are excluded. Readback requires attack
consumption/attacker disappearance **and** observed target damage or departure
from the still-visible tile. A departure is not a kill claim; hidden state is
never queried. Unknown/cancelled attacks are never repeated automatically.

Default remains 23 read-only tools; write mode has 55 tools (32 actions).
**156 Python and 311 Node tests pass.** T62 native ranged attack by Field Cannon
983054 spent its attack and damaged Franklin's Field Gun 4063280 from 0 to 30.
Native melee by Cuirassier 1245202 then spent its attack and the target left the
visible tile; independent read showed Cuirassier HP87 and no defender there.
Both typed operations verified. Preconditions were synthetic: a separate native
war declaration against player4 and debug-restored movement between ordinary
checked positioning steps. This is not naturally occurring campaign combat or
reusable war-declaration coverage. Debug create/reposition probes produced no
observed unit/location change. One positioning step returned unknown after its
short verifier timed out; later read-only evidence confirmed arrival, no repeat.
No turn advanced. Separate pre-war save
`Sidkick_Playground_BeforeCombat_T62_1793950860208` confirmed RESULT_OK, no overwrite;
the reviewed morning checkpoint also remains preserved. The test game is now at
war with Franklin; the original Merchant was not moved or ordered.

#### Adjacent shore crossings

The existing `move_civ7_unit` now supports land-unit embark/disembark steps under
the same empty, currently visible own/unowned destination, direct one-edge path,
native reachability/noncombat and exact permission checks. Source embarkation must
match the observed terrain; sea-domain units cannot leave water. Shore readback
requires the actual destination embarkation state **and** exact unit position.
This is not longer-path, commander, foreign-territory or transport support.

**157 Python and 312 Node tests pass.** Live T62 Scout3670032 moved normally from
Roskilde `(24,5)` to `(25,5)`, then embarked at `(25,4)`, verifying false→true.
After private movement restoration, typed disembark to `(25,5)` verified true→false.
Initial direct request to `(24,4)` was rejected: native reachability/path required
a detour, which this action correctly does not queue. Preconditions used restored
movement, not a naturally refreshed turn. No turn advanced; tool counts unchanged.

#### Katyusha and delayed combat readback

Katyusha2621473 fired normally from `(13,17)` at Franklin Cuirassier2687012 on
`(15,19)`: attack count1→0 and observed damage0→18. Only movement readiness was
privately restored. The two-second verifier returned unknown before native combat
effects appeared; later read-only evidence resolved it, with no repeated shot.
Combat verification now polls read-only evidence for up to **15 seconds** after
its single submission; other generic action windows are unchanged. Cancellation,
timeout and unknown outcomes still never resubmit. **158 Python and 312 Node
tests pass**, including a delayed-effect regression. A subsequent distinct direct
Katyusha shot verified after **2.588 seconds**, spending its attack and increasing
the primary target's damage38→57; the longer window now has positive live coverage.

User has explicitly deferred all turn advancement while unit/army/combat coverage
continues. Current sandbox checkpoint:
`Sidkick_Playground_BeforeArmyCombat_T62_1793956687710` (RESULT_OK, no overwrite).
Manual user checks confirmed T62 after war Continue, both Landships and Cuirassier
87/100. Original morning and pre-war saves remain preserved.

#### Bounded commander and packed-army movement

`move_civ7_commander(commander_id, x, y, expected_turn, max_steps=1)` accepts a
native current-turn path of at most the explicitly capped number of edges (1–8).
Every edge must be reachable, visible, empty, own/unowned, on unchanged land/water
terrain and explicitly noncombat. It rejects queued/off-map commanders, unknown
or foreign army membership, shore crossings, foreign territory and future-turn
orders. One fixed MOVE_TO/NONE request is followed by up to 15 seconds of read-only
verification of commander identity, destination and exact preserved packed IDs.
Authorization covers the commander and **all** packed members, not a selected subset.

Default remains 23 read-only tools; write mode has 56 tools (33 actions).
**158 Python and 315 Node tests pass.** Native commander65536 moved empty over two
edges `(28,30) → (28,29) → (29,29)` and returned. It packed Rifleman3080232, then
repeated the two-edge move with `[3080232]` preserved; independent logistics read
confirmed location and membership. Movement was privately restored for the tests;
no turn refresh or advancement is claimed. The packed army currently remains at
  `(29,29)`, and reinforcement3932172 still targets this army (arrival untested).

#### Commander Focus Fire and actual unit roles

`ranged_attack_civ7_army(commander_id, target_player, target_unit_id, x, y,
expected_turn)` issues the fixed native land-ranged Focus Fire command. It requires
a known unpacked land commander, at least one deployed ready **UNIT_CLASS_RANGED**
unit in native command radius with exact individual ranged permission, and the
native offered/selected target checks. Primary targets retain the field-combat
restrictions: one visible hostile combat-formation unit, existing war, own/unowned
tile, no district/stack/civilian primary target. The engine chooses participants;
authorization covers the eligible nearby group, not an arbitrary per-unit subset.

Readback captures participant identities/attack counts and requires at least one
participant to consume an attack/disappear, plus observed primary-target damage or
departure. Commander movement loss or permissive native command checks alone do
not prove firing. Native splash can affect adjacent enemies; neither this action
nor the individual attack verifier claims to verify every splash/secondary effect.
`get_civ7_combat_options.focusedLandRangedAttack` exposes native command evidence,
but is not proof of eligible participant roles. No raw command dispatcher exists.

Katyusha is siege-only, not Ranged-class: source tags and Focus Fire's description
explain why a native-permitted siege-only attempt spent commander movement without
firing. That initial attempt returned unknown and was not blindly repeated. The
action now rejects siege-only participant sets. In a distinct Ranged-class case,
commander3997707 ordered existing Field Gun2818084 to fire: attacks1→0 and target
Cuirassier2687012 damage18→38, verified in0.502s. New Katyusha4063242 then fired
normally, attacks1→0 and damage38→57, verified in2.588s. Independent reads confirmed
both spent attacks and enemy HP43. Multiple eligible participants are fixture-tested;
multi-unit simultaneous firing has not yet been live-verified.

Setup: commander3997707 normally purchased in Ur for1200 Gold; Katyusha4063242
purchased in Chichen Itza for990 after Ur correctly rejected further same-turn
purchases. Existing Field Gun2818084 travelled from `(26,12)` to `(14,17)` through
checked individual moves and shore crossings. Private movement restoration created
readiness; no attack-point grant, hidden-map reveal or turn advancement was used.
The original army's blocked all-land route was not bypassed; it remains packed at
`(29,29)`. Original Merchant3473432 remains untouched at `(18,20)`. Gold4731.33984375.
Default23 read-only tools; write mode57 tools (34 actions). **161 Python and 320 Node
tests pass.** Still T62. Enemy-territory/city attacks, coordinated melee, naval/air
commands and reinforcement arrival remain outside this verified batch.

#### Queued healing after combat

The real damaged Cuirassier1245202 accepted `REST_UNTIL_HEALED` at zero movement,
but settled into **HOLD with that exact operation queued**, not HEAL/OPERATION.
The original readback therefore returned unknown. The action/no-op check and
verifier now recognize HOLD only when a positive queue contains that exact current
healing operation; HOLD alone, an empty queue or a different operation never prove
healing. Readback exposes `healingQueued`. The original request was confirmed
read-only; the corrected handler returned `already_active` without resubmitting.
Health remains87/100: queued-order verification is not health restoration.
**161 Python and 321 Node tests pass.** No turn advanced.

#### Individual land-unit join/leave

`join_civ7_commander(unit_id, commander_id, expected_turn)` packs only the exact
selected nearby land unit into the exact owned land commander. This is distinct
from pack-all and distant reinforcement. `leave_civ7_commander(unit_id,
commander_id, x, y, expected_turn)` deploys only that captured member onto an exact
adjacent empty visible own/unowned native-offered tile. Both reject queued/
reinforcing sources, unknown or ambiguous membership, implicit transfers and
unsupported confirmations. Native capacity/eligibility remains authoritative.
Readback verifies the complete own army inventory with exactly the requested
selected-unit change and no unrelated membership changes. Targeted logistics
exposes `addToArmy`/`removeFromArmy` options and exact selected-command checks.

Live T62: Katyusha4063242 joined commander3997707 and then left back to `(16,17)`;
both typed actions verified, while Rifleman3080232 remained packed in army65536.
Movement readiness was privately restored; no extra attack points or turns were
used. Naval/air membership and nonadjacent joins are excluded. **164 Python and
325 Node tests pass.** Default23 tools; write mode59 tools (36 actions). New native
checkpoint `Sidkick_Playground_BeforeMembershipMeleeOverrun_T62_1793961086467`
confirmed RESULT_OK with no overwrite; earlier checkpoints and original Merchant
remain preserved.

#### Coordinated land melee

`melee_attack_civ7_army(commander_id, target_player, target_unit_id, x, y,
expected_turn)` uses native `FOCUSED_ATTACK_LAND_MELEE`, with actual Infantry/Cavalry
tags rather than inferred strength. Participants must be ready, deployed, unpacked,
nonreinforcing and in native command radius; any native-reachable participant that
would need an approach path is rejected. This initial family requires participants
already adjacent and one visible hostile land combat primary target on an own/
unowned land field. Native offered/selected command and individual melee checks
remain mandatory. No districts, stacks, civilians, enemy-territory targets, war
declaration, hidden travel, city capture or turn advancement. Readback proves actual
captured participant attack consumption/loss plus primary-target damage/departure.

The existing ranged and new melee wrappers share a fixed bundled `army_attack.js`;
only those two modes are accepted, not arbitrary commands. Combat readout adds
`focusedLandMeleeAttack` native permission evidence, with actual role/adjacency
eligibility still enforced by the action.

Live T62: Landship3801103 moved through checked steps `(12,17) → (13,18) → (14,18)
→ (15,18)`, then commander3997707's typed coordinated attack verified attack1→0
and Cuirassier2687012 damage0→45. Independent read: attackerHP79, defenderHP55.
Preconditions were synthetic: privately restored movement and explicit native
Health.restoreUnitHealth on the already-visible defender (damage57→0) to retain
separate test cases. No attack points were granted and no turn advanced. One live
participant was tested; simultaneous multi-participant execution remains fixture-
only. **167 Python and 327 Node tests pass.** Default23 tools; write mode60 tools
(37 actions).

#### Native-gated packed-army Overrun

`overrun_civ7_unit(commander_id, target_player, target_unit_id, x, y,
expected_turn)` accepts only the exact native offered/selected Overrun command for
an adjacent visible hostile land combat unit on an own/unowned land field. It
requires an owned mobile deployed unqueued land commander with verified packed
combat members. Strength thresholds and odds are never guessed; native rejection
always stops submission. No civilians, stacks, districts, enemy territory, war
declaration, automatic unpacking or turn advancement is supported.

Readback requires the target to leave a still-visible tile, commander arrival and
movement spend, and unchanged packed membership. It never follows a departed
enemy into hidden state or calls that an independently confirmed kill. Combat
readout includes exact native `overrun` permission evidence.

**Positive Overrun execution is not live-verified.** Native eligibility rejected
the post-melee55HP defender, then also rejected an explicit private1HP setup and
a full four-combat-unit packed army, with `Insufficient Strength Difference`.
The handler was never allowed to send an Overrun request; no check was bypassed.
Positive execution/readback is fixture-tested. The full test army remains packed
in commander3997707 at `(15,18)` with Landship3801103, Field Gun2818084 and
Katyushas2621473/4063242. This also live-tested preserving existing members during
individual joins. A separate post-attack packed return move did not resolve and
was explicitly cancelled, not repeated; natural-readiness coverage remains open.

**170 Python and 331 Node tests pass.** Default23 read-only tools; write mode61
tools (38 actions). Still T62 with no turn advancement; Gold4731.33984375 and the
original Merchant unchanged. See [the remaining-task inventory](docs/civ7-action-backlog.md#remaining-work-after-these-requested-batches-2026-11-06)
for implementation gaps versus live-verification gaps.
Final native save `Sidkick_Playground_AfterMembershipMeleeOverrun_T62_1793962725991`
confirmed RESULT_OK with no overwrite. Front commander's queue is empty; earlier
reviewed checkpoints remain preserved. The synthetic Overrun test defender remains
at1HP; no Overrun was forced through its native rejection.

#### Second Wind

`grant_civ7_second_wind(commander_id, unit_id, expected_turn)` uses exact native
offered/selected recipient permission. Initial coverage is a deployed unqueued land
commander and one unqueued nonreinforcing land combat recipient alone on a visible
own/unowned tile. Native checks control ability/charge/range eligibility. Readback
proves exactly +2 movement/+1 attack, stable recipient health/location and unchanged
source packed membership. Selected commander logistics includes `secondWind` options.
No move, unpack, hidden recipient, naval/air recipient or turn advancement is implied.

Live MCP T62: Field Gun2818084 at `(14,18)` gained movement1→3, attacks0→1;
commander3997707 retained its other three packed members. Ability eligibility was
synthetic: +200 XP, then five checked native promotions including Valor. No attack
points were debug-granted; cooldown/recharge through turns remains untested.
Force March is not exposed: localization/UI remnants exist but no corresponding
command definition is installed. **173 Python / 335 Node tests pass; 62 tools
(39 actions) in write mode, default23 read-only tools unchanged.**

#### Ranged attacks on enemy-owned fields

`ranged_attack_civ7_enemy_field(unit_id, target_player, target_unit_id, x, y,
expected_turn)` is a separate ranged-only tool; the existing attack tool's own/
unowned boundary is unchanged. Tile ownership must match the exact met wartime
target player. Native MapCities must identify a non-district field with a known
owning city and a visible, different centre. Undefended urban districts are also
excluded, not just defensible districts. All existing ready attacker, one visible
combat defender and exact native ranged-picker/selected-target checks still apply.
No city/district damage, melee entry/capture, stacks, civilians, third-party
territory, war declaration or turn advancement is supported. Primary-target-only
verification retains the existing splash/kill limitations.

Positive enemy-field execution is fixture-only. Actual MCP correctly rejected
Heavy Artillery3407914 on the urban district at `(15,20)` without firing. Nearby
other targets were stacks; private native test-unit creation returned false, so
no manufactured positive execution is claimed. **176 Python / 336 Node tests
pass; write mode63 tools (40 actions), default23 read-only tools unchanged.**
At this point army-wide upgrades were pending; a later packed-fleet case below
provides the missing native aggregate quote and positive execution coverage.

#### Individual fleet join/leave

`join_civ7_fleet(unit_id, commander_id, expected_turn)` and
`leave_civ7_fleet(unit_id, commander_id, x, y, expected_turn)` use exact same-domain
naval membership. Requires a Fleet Commander, a packable naval combat ship, water
locations and the existing adjacency/visibility/native offered-and-selected checks.
Leaving requires an empty adjacent visible own/unowned water tile. All other own
army memberships must be preserved. Civilian ships, air units, land-unit transport,
implicit transfers and full-fleet pack/unpack are not covered by these tools.
Selected naval logistics now reports exact checked join/leave options.

Live T62: Dreadnought3342357 joined Fleet Commander131073 at `(46,30)` then left
back to its original `(47,30)` water tile, with both land armies unchanged.
Movement was privately restored; no turns advanced. **176 Python / 338 Node tests
pass; write mode65 tools (42 actions), default23 read-only tools unchanged.**

#### City-only aircraft rebase

`rebase_civ7_aircraft(unit_id, target_city_id, expected_turn)` requires the exact
owned unpacked deployed aircraft, a visible owned city centre and native offered/
selected REBASE permission. No queued or reinforcing source, hidden/foreign base,
carrier/squadron transfer, commander rebase, auto-unpack or turn advancement.
Readback requires the same aircraft at the exact city centre with clear queue,
stable health and every captured own army membership unchanged. Automatic packing
is not accepted as deployment; an unverified arrival is never retried automatically.

**Positive rebase execution is fixture-only.** The live game has no aircraft and
checked nearby cities offer no air purchases. MCP type rejection was verified with
a naval unit, not presented as aircraft execution coverage. **179 Python / 341
Node tests pass; write mode66 tools (43 actions), default23 read-only unchanged.**

#### Full-fleet drill and deployment readback

The existing `pack_civ7_commander`, `move_civ7_commander` and
`unpack_civ7_commander` tools have now been exercised on a Fleet Commander, not
only land armies. Native capacity selected four nearby ships, a packed water-tile
round trip preserved all four, and full deployment emptied the fleet and deployed
all four. The fifth nearby ship stayed outside the full fleet. Initial movement
readiness was privately restored; no turns advanced.

The first unpack returned unknown at the two-second deadline, then later read-only
inspection proved full deployment. It was not repeated. Pack/unpack now use the
existing15-second commander verification window; ordinary action deadlines remain
unchanged. A distinct second native pack/unpack verified through MCP in0.225/0.198s;
the delayed-application regression, not that fast live call, exercises the extended
window. Native unit placement is engine-selected, not an exact per-member tile claim.

**181 Python / 341 Node tests pass.** Final native save
`Sidkick_Playground_AfterAirNavalLogistics_T62_1793966046841` confirmed RESULT_OK,
no overwrite. Still T62; Gold and original Merchant unchanged. Fleet commander
at `(46,30)` is empty, and all five nearby combat ships are deployed with queue0
and HP100. Other land armies retain their members.

#### Native naval attacks

`naval_attack_civ7_unit(unit_id, target_player, target_unit_id, x, y, expected_turn)`
uses the distinct native `UNITOPERATION_NAVAL_ATTACK` picker and selected check.
Initial scope is a ready deployed unqueued unpacked nonreinforcing naval combat
ship against one exact visible hostile naval combat ship on an own/unowned
non-district water tile, in an existing met war. Native naval offered plots do not
need the generic ranged picker's Modifiers. Existing land attack behavior is unchanged.
No shore bombardment, civilian/stack/district/city targets, enemy territory, new war
or turn advancement. Verification retains primary-target attack consumption/loss
plus visible damage/departure, not kills or complete splash effects.

**Positive naval fire is fixture-only.** Restoring Dreadnought3407900's movement
did not produce native targets; actual MCP type rejection was tested on a land
target, not represented as firing coverage. **184 Python / 342 Node tests pass;
write mode67 tools (44 actions), default23 read-only tools unchanged.**

#### Commander and packed-army rail travel

`rail_civ7_commander(commander_id, x, y, expected_turn)` uses exact native
MOVE_BY_RAIL offered/selected permission. Requires a mobile unqueued unembarked
land commander, known captured packed membership, visible owned land endpoints
and an empty destination. It never infers connectivity, falls back to walking,
buys a station, unpacks or advances a turn. Readback proves exact arrival, preserved
members and queue0. Selected land commander logistics includes checked `rail` options.
Ordinary-unit rail, naval/air transport and foreign/fogged destinations are excluded.

Live MCP T62: separate commander4128776 was normally purchased in St. Petersburg
for2000Gold, approached its actual station by checked movement, then rail-travelled
empty `(19,11) → (13,4)`. Explicitly selected Rifleman2490373 joined it after two
checked setup moves; packed rail `(13,4) → (26,11)` then verified member preservation
and queue0. Movement was privately restored between cases/for positioning, not
naturally renewed by turns. Both original land armies and the fleet were preserved.

**184 Python / 345 Node tests pass; write mode68 tools (45 actions), default23
read-only unchanged.** Final native save
`Sidkick_Playground_AfterNavalAttackRail_T62_1793967597361` confirmed RESULT_OK,
no overwrite. Still T62, Gold2731.33984375; original Merchant unchanged. The new
rail test commander remains at Copan station with Rifleman2490373 packed.

#### Capped all-member army/fleet upgrades

`upgrade_civ7_army(commander_id, max_gold_cost, expected_turn)` uses native
UPGRADE_ARMY for1..16 packed land/naval combat members, **all directly upgradeable**.
Each exact native target/English price must reconcile with the native aggregate
count/Gold quote, within cap and treasury. Mixed eligibility, unsupported/localized
price formats, queues and confirmations are rejected. Authorization covers the
whole captured group; there is no subset selection, purchase, unpack or turn advance.

Readback requires every quoted target type in the same army, exact Gold spend,
preserved unaffected owned unit identities/types and unchanged other armies.
Native replacement IDs are supported. Duplicate-type replacements are proved as
a multiset, not assigned speculative one-to-one original identities. Selected
commander logistics exposes `upgradeArmy` native count/Gold quote; this does not
replace the action's per-member reconciliation.

Live MCP T62: three exact Frigates joined Fleet Commander131073 through typed
naval membership. Each quoted Dreadnought/200Gold; group quoted600Gold. Cap599
rejected, then cap600 verified three replacement Dreadnoughts4194311/4259882/4325419,
all packed at `(46,30)`/HP100. Gold2731.33984375→2131.33984375; unaffected inventory
and the other three armies preserved. Movement readiness was privately restored;
no free upgrades/debug tech or extra turns. Land/mixed-type group execution remains
fixture-only; mixed eligible/ineligible groups are deliberately excluded.

**187 Python / 351 Node tests pass; write mode69 tools (46 actions), default23
read-only unchanged.** Native save
`Sidkick_Playground_AfterGroupUpgrade_T62_1793968151444` confirmed RESULT_OK,
no overwrite. Still T62; original Merchant unchanged. Earlier checkpoints preserved.

#### Ordinary-unit rail

`rail_civ7_unit(unit_id, x, y, expected_turn)` extends native rail to ordinary
deployed unpacked/nonreinforcing unqueued land units. Requires unembarked source,
visible owned land endpoints, empty target and exact native offered/selected rail
permission; no walking fallback, commander transport or turn advancement.
Live MCP Rifleman2490373 travelled Copan station `(26,11)` → St. Petersburg station
`(19,11)`, exact identity and queue0 verified with debug-restored movement.
**187 Python / 352 Node tests pass; write mode70 tools (47 actions), default23 unchanged.**

#### Resource unassignment and atomic swaps

`unassign_civ7_resource(resource_instance, off_map, settlement, expected_turn)`
deactivates only the exact resource in its exact current owned source settlement.
Native locks/permission and map/off-map identity apply; no bulk/factory clearing.
`swap_civ7_resources(first_resource_instance, first_off_map,
second_resource_instance, second_off_map, expected_turn)` uses native atomic
SWAP_RESOURCES, not two assignments. Both sources must be assigned; readback proves
the complete owned resource ledger with precisely the requested exchange.

Live Pearls618 unassignment/reassignment in Roskilde verified and restored the
original slot. Positive atomic swaps remain fixture-only: native pair1063/618
was rejected, and a bounded read-only search found no eligible tested pair with618.
No rejected swap request was submitted or replaced with a non-atomic workaround.
**191 Python / 356 Node tests pass; write mode72 tools (49 actions), default23 unchanged.**

#### Exact production-queue edits

`edit_civ7_production_queue(settlement, queue_token, action, index, expected_turn,
other_index=None)` supports cancel or one adjacent swap using native BUILD
RemoveAt/Swap. Supply the exact `production.queueToken` from available-decisions;
the token is compared, never evaluated. Queues are bounded to64 entries and stale
indices/tokens or confirmations are rejected. Readback verifies the entire ordered
queue. Cancellation may affect active production/reservations; no refund or
invested-progress retention is promised. No multi-step reorder or turn advancement.

Live MCP appended two disposable tail orders behind Copan's existing Scout,
swapped only those tails and cancelled both. Every edit verified and the exact
original queue token was restored; no original order, Gold or turn changed.
**194 Python / 359 Node tests pass; write mode73 tools (50 actions), default23 unchanged.**

#### Direct commander Heroic Assault

`attack_civ7_commander(commander_id, target_player, target_unit_id, x, y,
expected_turn)` uses fixed native COMMANDER_ATTACK against an exact adjacent
visible same-domain combat unit on an own/unowned non-district field in an existing
met war. Native permission controls ability eligibility. Requires ready deployed
unqueued unembarked commander and known packed membership. It does not attack with
packed members, enter enemy territory, capture or advance turns. Readback requires
source movement/attack spend, primary-target damage/departure and stable source
location/membership; not numeric charge accounting, kills or full splash proof.

Live MCP: commander3997707 dealt40 damage to Cuirassier2687012, movement3→2 and
attacks1→0 with all three packed members preserved. Synthetic prerequisites were
+1000 XP followed by checked Bastion/Duty promotions, and restoration of the old
1HP test defender to full health. No attack/ability effect was debug-forced.
**197 Python / 361 Node tests pass; write mode74 tools (51 actions), default23 unchanged.**

#### Non-capturing wartime field advance

`advance_civ7_unit(unit_id, target_player, x, y, expected_turn)` enters one exact
empty adjacent visible enemy field with MOVE_TO/NONE in an existing met war.
Requires ready unqueued unpacked/nonreinforcing land/sea combat unit, same terrain,
no embarkation, native reachable direct noncombat path and no district/city at the
destination. No implicit war, capture, stacking, foreign third party, fog or turn
advance. Existing ordinary movement's own/unowned boundary remains unchanged.

Live MCP Field Gun2818084 advanced `(18,18) → (18,19)` into Franklin's empty field,
exact identity/unembarked/queue0 verified, movement2→1 and attack1 retained. Approach
used checked steps and private movement restoration, not extra attack points.
**197 Python / 362 Node tests pass; write mode75 tools (52 actions), default23 unchanged.**

#### Ranged city/district bombardment

`bombard_civ7_district(unit_id, target_player, district_id, x, y, expected_turn)`
uses land ranged/siege fire against one exact visible hostile defensible district
with remaining HP, existing met war and native attackable picker/selected permission.
Requires a ready deployed unqueued unembarked unpacked/nonreinforcing attacker.
Combat-options exposes the district owner/instance/component identity. Garrisoned
districts are supported; only primary district damage/departure and attacker attack
spend/loss are verified, not full garrison/retaliation/splash effects. No entry,
capture, destruction claim, naval/air strike, new war or turn advancement.

Live MCP Field Gun2818084 fired from `(18,19)` at city-centre district196610 on
`(18,21)`: attack1→0 and district damage0→10, with no debug district damage.
**200 Python / 364 Node tests pass; write mode76 tools (53 actions), default23 unchanged.**

#### Aerodrome rebase correction and synthetic combat cases

Native Tuner `CREATE_ELEMENT` enabled explicitly synthetic units/bases without
advancing turns. Normal MCP enemy-field ranged fire (Field Gun4390956 → Franklin
Rifleman4653101) verified21 damage; normal naval fire (existing Dreadnought3407900
→ synthetic Frigate4718629) verified31 damage. Both consumed one attack normally.

The first Biplane4456493 rebase reached a synthetic city Aerodrome but returned
unknown: native arrival stations it inside the base, not on-map at city coordinates.
That request was not repeated. Rebase now captures exact visible owned city bases,
verifies stationing and precisely one aircraft's source/destination membership delta
while preserving every other member. Sources may be deployed or city-Aerodrome
stationed; squadron/carrier transfers remain excluded. A distinct normal MCP return
from St. Petersburg to Copan verified4456493 stationed in4653104 with stable health,
queue0 and all other armies preserved. Test-plane movement restoration was synthetic.
**200 Python / 365 Node tests pass; tools unchanged at23/76 (53 actions).**

#### Constructible pillaging

`pillage_civ7_tile(unit_id, target_player, x, y, target_token, expected_turn)` uses
native PILLAGE on the exact visible wartime non-centre tile already occupied only
by the selected ready land combat unit. Supply `pillage.targetToken` from combat
options. Requires known unpacked/nonreinforcing state, a visible owning centre
elsewhere, fresh full constructible token and exact offered/selected permission.
Native chooses which building/improvement to damage. Readback proves movement
spend and visible new constructible damage/departure, not exact loot/healing.
No capture, route pillage, coastal raid, war declaration or turn advancement.

Live MCP synthetic Rifleman4784178 pillaged existing Woodcutter3735608 on `(18,22)`:
movement2→0 and damaged=false→true. No forced damage or healing claim. Another
urban test correctly rejected its fogged owning centre; the original Merchant
was untouched. **202 Python / 369 Node tests pass; tools23/77 (54 actions).**

#### Multi-participant combat observation

Normal MCP Focus Fire with two synthetic Field Guns consumed both attacks and
dealt47 damage. Distinct coordinated melee with two synthetic Riflemen consumed
both attacks and dealt76 damage (attackerHP77/87). Melee initially returned after
one hit; complete consumption was confirmed later by read-only evidence, not by
resubmitting. Setup used native Tuner units, checked movement and labelled readiness/
defender-health restoration; no attack consumption or damage effect was forced.

Readback exposes per-participant attack counts, consumption/loss, HP, location and
queue plus `allCapturedParticipantsConsumed`. Primary-effect success still means
at least one participant fired; it does not imply every secondary attack finished.
Negative/unknown counters are not proof of consumption. Kill/full-splash accounting
remains excluded. **202 Python / 370 Node tests pass; tools23/77 (54 actions).**

Individual land/fleet leave tools also accept their exact commander origin when
native permission offers it and only that commander occupies the tile. Unrelated
stacks/ambiguous commanders are rejected and occupancy is checked again before
submission. Live Tank5177400 deployment at65536's origin restored the original
Rifleman-only packed army with every other membership preserved. Naval-origin
deployment is fixture-only. **202 Python / 371 Node tests pass; tools23/77.**

#### Air strikes from city Aerodromes

`air_attack_civ7_unit(unit_id, target_player, target_unit_id, x, y, expected_turn)`
uses fixed native AIR_ATTACK from a ready aircraft stationed in one captured
visible owned city Aerodrome. The target must be one exact visible hostile land/
sea combat unit on an own/unowned non-district field in an existing met war, with
exact native offered/selected permission. Full own army membership is captured.
Readback requires aircraft attack spend/loss, primary-target damage/departure and
preservation of the source city/base and every surviving packed member. No carrier/
squadron, deployed-source, district, enemy-territory, air-to-air or nuclear mission;
no kill, full retaliation/interception/splash or recharge claim.

Live MCP synthetic Biplane4456493 struck Frigate4718629 from Copan Aerodrome4653104:
attack1→0, target damage31→51 (20 new damage), source/other membership preserved.
Movement setup was synthetic, firing/damage were normal native execution. Combat
options recognizes a captured city base without pretending the plane is deployed.
**204 Python / 375 Node tests pass; tools23/78 (55 actions).**

Progress save `Sidkick_Playground_GroupOneProgressAirPillage_T62_1793979550612`
confirmed RESULT_OK/no overwrite; original Merchant remains100HP at `(18,20)`.
No turn advanced, Gold2131.33984375 unchanged. Group 1 is still incomplete; see the
backlog's remaining implementation/verification split. Group 2 turns remain deferred.

`coastal_raid_civ7_tile` adds fixed native naval raids on an adjacent empty visible
enemy land tile with a fresh combat-options constructible token. Requires a ready
unpacked/nonreinforcing ship on water, visible owning centre elsewhere and exact
native offered/selected permission. Verifies movement spend, stable ship origin and
new constructible damage/departure; no loot/healing, landing or capture claim.
Live typed Python synthetic Frigate5242937 raided existing Woodcutter3538997:
movement3→0 and damaged=false→true. **205 Python / 376 Node pass; tools23/79.**

`melee_attack_civ7_enemy_field` adds exact adjacent melee on enemy-owned non-centre/
non-district fields; no city capture. `naval_attack_civ7_land_unit` adds fixed native
NAVAL_ATTACK at one visible enemy-owned non-centre/non-defensible land combat
target, including rural districts, without landing. `bombard_civ7_shore_district`
uses separate exact defensible-land-district native naval targeting; positive
coastal fortified-district execution remains fixture-only. Existing war and fixed
native offered/selected permission apply; no arbitrary attacks or damage forecasts.
Live typed synthetic Tank melee dealt48 damage; Frigate shore fire dealt25. No
attack/damage effect forced. **208 Python / 378 Node pass; tools23/82 (59 actions).**

`append_civ7_advanced_construction` queues an explicit Wonder/repair/overbuild/
improvement intent on an exact visible owned city tile. Requires fresh placement
targetToken, exact native offered/selected Append permission and matching native
preview or damaged repair instance. Overbuild acknowledges an exact intact old
building; Wonder/improvement rural replacement additionally needs explicit
`replace_improvement=true`. No purchase/instant completion or bulk repair.
Live Copan Eiffel Tower, Obshchina and Brickyard-over-Guildhall queue appends each
verified, then only new tails cancelled and original Scout queue restored. Repair
is fixture-only after a native-blocked setup attempt. Completion/effects require
later turns, not claimed. **209 Python / 381 Node pass; tools23/83 (60 actions).**

`choose_civ7_religious_action(kind, choice, expected_turn)` supports fixed pantheon,
belief and religion-founding operations. Exact IDs, unlocked pantheon choice or
claimable/free UI-class belief slot, founding eligibility and native permission
are required. Readback verifies exact selections/religion and prior collections.
Founding leaves mandatory belief choices for separate checked actions. Current
Modern save has no eligible choice: positive execution is deferred, fixtures pass.
**210 Python / 383 Node pass; tools23/84 (61 actions).**

`befriend_civ7_independent` starts one native offered, capped befriending project
for an exact met/discovered independent power; verifies a new local event, not
completion. `choose_civ7_city_state_bonus` requires the exact pending picker, local
suzerainty and native bonus eligibility; verifies selected bonus/consumed picker.
Current save has no known independent or pending picker, so positive live cases
remain unavailable. **211 Python / 385 Node pass; tools23/86 (63 actions).**

`perform_civ7_local_civilian_action` exposes only fixed found/excavate/research/
spread/great_person/resettle intents at a proven current tile, with role, visibility,
owner, queue, packing/reinforcement, linked ability and native permission guards.
Founding verifies one new exact settlement plus consumed Settler and preserved old
settlements. Archaeology can verify a queued exact operation, not completed reward;
spread/Great Person consumption is not full effect accounting. Current-tile
resettlement additionally requires that exact native offered destination.
Live test Settler founded1179665 `(1,8)` preserving all17 prior settlements; Explorer
queued excavation at `(14,19)`. Research is natively Hegemony-gated; Modern has no
missionary definition/eligible Great Person activation. No turn or forced effect.
**212 Python / 388 Node pass; tools23/87 (64 actions).**

`resettle_civ7_migrant` uses the explicit native acquire-tile path: exact ready
Migrant, visible empty same-city/unowned x/y and approved improvement from native
paired RESETTLE choices. No implicit tile transfer/overbuilding/specialist placement.
Selected-unit logistics exposes choices; readback needs consumed Migrant, one new
exact improvement and source-city population/pending growth. Live5570622 became
Fishing Boat17694949 `(27,12)`, Copan population increased to42, pending0.
**213 Python / 391 Node pass; tools23/88 (65 actions).**

`connect_civ7_merchant_road` binds a ready Merchant at one owned visible centre to
another owned visible native-offered centre, with a currently missing connection.
No movement fallback, foreign endpoint, extra quoted cost or confirmation. Readback
requires consumption/spend and a new bidirectional endpoint connection with old
links preserved, not every road hex. Selected Merchant logistics lists endpoints.
Live synthetic5701696 connected Copan–Ur and was consumed; original Merchant was
untouched. **214 Python / 393 Node pass; tools23/89 (66 actions).**

`archive_civ7_great_work` moves one exact owned displayed work to native archive,
verifying its location and the complete owned work ledger. Existing empty-slot
moves now preserve/verify that ledger too. Archive + checked moves support explicit
non-atomic exchanges; stop on failed/unknown stages, never blind retry/auto-rollback.
Live13/6 exchanged Museum/Palace via archive buffer, every stage verified, then
inverse stages restored the exact original inventory. No Tourism/yield forecast.
**215 Python / 394 Node pass; tools23/90 (67 actions).**

`declare_civ7_war` explicitly selects surprise/formal war against a met major,
requiring native declaration eligibility and selected permission. Live surprise
war against5 verified; formal relationship gate rejected without submission.
Readback is bilateral, not full diplomatic cascade accounting.
`start_civ7_hostile_diplomatic_project` adds fixed capped no-secondary sanctions/
espionage using native offered quotes. Infiltration80 and Hinder Research81 against
Franklin4 started and verified, spending210 Influence, leaving174.82421875. No
completion/secrecy claim or turn. **216 Python / 396 Node pass; tools23/92 (69 actions).**

`pillage_civ7_route` binds fixed native PILLAGE_ROUTE to a token-bound occupied
visible enemy non-centre tile. Readback requires movement spend and changed route
type, not just an accepted request. Live2818084 spent2 movement but the route type
did not change: **outcome unknown, never retried**. Native road-vs-trade-route effect
semantics remain unresolved; no destruction/loot claim. Fixtures pass.
**217 Python / 397 Node pass; tools23/93 (70 actions).**

Follow-up: PILLAGE_ROUTE is absent from the loaded operation definitions despite
legacy UI source/permissive canStart. An installed-definition gate now rejects it
without submission. The active build instead defines PLUNDER_TRADE_ROUTE as a
command; its trade-route semantics are a separate target. No second legacy request.

`transfer_civ7_aircraft` binds one exact aircraft to a unique owned native-offered
Aerodrome/squadron/carrier destination. Verifies off-map stationing, exact membership
delta across all owned armies, clear queue and stable health. City rebase also
accepts a proven carrier/squadron source. Co-located air commanders reject rather
than guess. Live4456493 transferred Copan→test Carrier5767185→Copan, both journeys
verified; isolated test squadron was not natively offered, no transfer submitted.
Movement restoration was synthetic setup; membership/effects were not forced.
**218 Python / 398 Node pass; tools23/94 (71 actions).**

`air_attack_civ7_from_commander` explicitly binds a single aircraft to its captured
Aerodrome/squadron/carrier and one exact visible own/unowned field target. Existing
war/native gates, full membership preservation and primary-effect verification
apply; no grouped mission, district bombing or full interception/splash accounting.
Live test5898306 from Carrier5767185 dealt16 damage to Frigate4718629, attack1→0.
Aircraft/base setup and movement readiness were synthetic; attack/damage were native.
Native carriers also set the squadron flag: definition-first classification now
enforces carrier water guards in missions and transfers.
**219 Python / 399 Node pass; tools23/95 (72 actions).**

`cross_civ7_commander_shore` crosses one direct native noncombat ocean shore edge,
preserving captured packed members and verifying arrival, embarkation and queue0.
Visible empty own/unowned destinations only; no attack/capture/future-turn order.
Navigable rivers are excluded from this explicit mode because their embarkation
does not equal isWater; existing bounded river travel remains unchanged.
Live test6094917 with6160454 embarked `(4,6)→(3,5)`, transported to `(4,5)` and
disembarked `(4,6)`, exact member preserved. Synthetic movement readiness only
between completed cases; no embarkation/membership forced.
**220 Python / 400 Node pass; tools23/96 (73 actions).**

`clear_civ7_factory_resources` explicitly clears one producing city's current
factory type using a fresh commerce clearToken, native permission and full owned
resource/assignment ledger verification. Ordinary assignment rejects implicit type
replacement; clear/reassign is non-atomic, with no auto-rollback/GDP claim.
Live Tin→clear→Coffee→clear verified and original assignments restored. Factory
prerequisite was **debug-completed** over Copan Guildhall, after a new verified
no-overwrite checkpoint; original Scout order preserved. This does not prove normal
production/completion. Synthetic Factory remains. No turn/Gold spend.
**221 Python / 402 Node pass; tools23/97 (74 actions).**

`assault_civ7_city` explicitly permits adjacent melee/occupation of one exact
visible empty enemy settlement centre, with native classification/reachability
and preserved prior city ledger. `resolve_civ7_city_capture` separately keeps or
starts razing an exact pending owned capture. Decisions exposes IDs/flags/options.
Three native attacks captured test Town `(23,9)` and keep verified; no damage or
ownership forced. Separate **debug-depleted** Town `(23,14)` was normally occupied
and native razing started; completed destruction is turn-deferred. Garrison/stack/
civilian attacks, full conquest effects and liberation remain outside this family.
**222 Python / 404 Node pass; tools23/99 (76 actions).**

`manage_civ7_white_peace_deal` provides separate prepare/propose/accept/reject
steps, one native write each. Exact met major, existing war, native peace eligibility
and a single MAKE_PEACE agreement only; no concessions/demands. Fresh draft tokens
bind submissions/responses; preparation never discards existing working data.
Pending negotiation is not peace; acceptance readback requires bilateral peace.
Both current wars are natively cooldown-blocked for10 turns: guard rejection only,
no draft/submission sent or eligibility bypass. Positive execution is deferred.
**223 Python / 406 Node pass; tools23/100 (77 actions).**

`levy_civ7_city_state_unit` binds an exact native-offered unit ID/public type to its
selected Influence quote under local suzerainty. Readout exposes paired levy choices
without inspecting hidden foreign units. Levies are immediate on this build, not
persistent projects: first7 levy spent60/produced Scout6619213 but returned unknown
under the original event verifier, never retried. Corrected verifier captures all
owned units and requires one chosen-type receipt, old inventory preserved, exact
debit and continued suzerainty. Distinct8 levy verified Scout6684750 for60 Influence;
no synthetic setup. Influence54.82421875; T62 unchanged.
**225 Python / 408 Node pass; tools23/101 (78 actions).**

`plunder_civ7_trade_route` uses the real installed current-tile PLUNDER_TRADE_ROUTE
command, separate from the absent legacy road operation. Requires a ready visible
sole-unit source, known packing/treasury, own/unowned/existing-war tile and native
permission. Native chooses the eligible trade route. Readback needs movement spend,
stable source, positive Gold gain and command becoming unavailable; no exact route
identity/owner, physical road destruction or full connectivity claim. No eligible
ready live source found; no plunder request submitted, positive case fixture-only.
**226 Python / 409 Node pass; tools23/102 (79 actions).**

`choose_civ7_extended_narrative` supports acknowledged trial-head choices and paid
choices only with matching known Gold/Influence currency, native affordability and
an actual runtime Cost quote under a cap. Missing quote/currency rejects; definition
prices never substitute. Trial readout now models native linked/requisite options.
Readback verifies exact instance consumption and net spend, not full scripted
rewards/gross debit or Age effects. Current Modern has no pending paid story or
TRIAL definition; positive cases remain fixture-only, no narrative mutation sent.
**227 Python / 410 Node pass; tools23/103 (80 actions).**

`start_civ7_targeted_diplomacy` binds fixed aid amount, visible owner-qualified
Hinder Food city or met-major independent-raid victim to native paired choices and
exact caps; zero primary quote required rather than guessing combined costs.
Normal50-Gold aid to1 verified after native alliance setup, with zero Influence
debit; Gold2081.33984375. Foreign treasury/secondary completed effects not claimed.
Hinder Food unavailable, no known independent raid source; guards/fixtures cover
both. Native alliance setup is not a typed alliance-tool capability claim.
**228 Python / 411 Node pass; tools23/104 (81 actions).**

`withdraw_civ7_project_support` removes one sole local support token from an exact
supported own active project with known zero cancel/unsupport penalties. No incoming
projects, wars, other supporters or paid cancellation. Readback distinguishes
withdrawal, cancellation and scheduled cancellation, with no unexpected net debit.
Native Infiltration80 canceled immediately and own support became0; Hinder Research81
penalty10 rejected without submission. No forced effects or turn advancement.
**229 Python / 412 Node pass; tools23/105 (82 actions).**

`establish_civ7_air_base` uses native offered/selected ESTABLISH_BASE on empty
visible own/unowned land. Verifies squadron arrival, movement spend, stable health/
army identity, clear queue and preserved packed members/owned IDs. Logistics exposes
filtered base choices. Native establishment made test5832769 an offered aircraft
destination; typed4456493 carrier→squadron transfer verified, then typed squadron
relocation `(22,11)→(21,12)` retained that aircraft. Movement setup only was synthetic.
**230 Python / 414 Node pass; tools23/106 (83 actions).**

`group_civ7_air_attack` executes one native Ground Attack from a squadron/carrier,
binding role-eligible packed aircraft, visible exact land target and full membership.
Readback distinguishes some/all consumption and requires primary effect plus exact
surviving membership. Fighters are not Ground Attackers: their Fighter Sweep is a
different location mission. Live6881361 dealt17 to5177402 and consumed its attack;
all armies preserved. One eligible attacker live; multi-aircraft cases fixture-tested.
**231 Python / 416 Node pass; tools23/107 (84 actions).**

`sweep_civ7_air_location` uses native Fighter Sweep at an exact visible own/unowned
location; live both Fighters consumed missions, all memberships retained. No
interception/kill/new sight claim. `bombard_civ7_air_district` uses native Carpet
Bomb against exact empty visible enemy district. Rural zero-HP districts require
fresh constructible token; live7012435 damaged7340143 at `(23,21)` and consumed its
attack, all armies retained. Synthetic aircraft/readiness, native effects.
**232 Python / 417 Node pass; tools23/109 (86 actions).**

`manage_civ7_peace_concession` separately edits or negotiates exact peace plus
native Gold/Influence lump terms. Full draft/offer tokens, gross local caps and
native peace eligibility required; never clears other work or auto-submits edits.
Acceptance requires bilateral peace and agreed own currency deltas. Diplomacy
exposes supported draft/offer tokens only, not raw asset terms/private treasuries.
Native10-turn peace cooldown rejected live editing before mutation; positive
negotiation remains fixture-only. Asset concessions are not supported here.
**233 Python / 420 Node pass; tools23/110 (87 actions).**

`found_civ7_adjacent_settlement` binds native offered adjacent empty unowned land,
including embarked founders; verifies consumed founder/new exact city and old-city
preservation. `spread_civ7_foreign_religion` binds an exact visible met foreign
centre under the Missionary and verifies own charge/unit consumption only, without
reading foreign private effects. Test7077972's native adjacent picker rejected
before request; current Modern has no Missionary definition. Positive cases remain
fixture-only; no founding/spread effects forced.
**234 Python / 421 Node pass; tools23/112 (89 actions).**

`withdraw_civ7_capped_project_support` acknowledges explicit native definition
penalty caps and removes exactly one own token, preserving captured other support.
Default remains sole-token/zero-penalty; last own token with other supporters rejects.
Native penalty10 cancellation and project73 support2→1 verified, original project
retained. Multi-token setup used disposable Influence then reset its original
54.82421875 balance; Merchant independently intact. New separate AirDiplomacy T62
progress save confirmed RESULT_OK. Definition penalties are not currency quotes.
**235 Python / 422 Node pass; tools23/113 (90 actions).**

`observe_civ7_field_attack` adds bounded visible-unit health deltas and exact native
kill attribution to one guarded melee/ranged strike. Departures/hidden units are
never guessed as dead; observers are bounded and closed/replaced, no raw-JS tool.
Live first strike observed40 damage/14 retaliation; distinct second strike confirmed
native kill5242939 by7340120 and15 retaliation, nearby captured units unchanged.
No HP/kill/counters forced. Nonzero secondary splash fixture-tested only; hidden/
out-of-radius/interception/global effects remain explicitly incomplete.
**237 Python / 427 Node pass; tools23/114 (91 actions).**

`get_civ7_peace_city_offer` reads only one exact known visible owner-qualified
centre. `manage_civ7_city_peace_deal` edits or negotiates that explicit native OFFER
city with full draft/offer tokens, separate acceptance and capped existing economic
terms. Acceptance verifies recipient centre, unaffected own cities and own currency
deltas; city contents/units/works are not fully inventoried. Last own city rejects.
Live native offer read and cooldown rejection only; give/receive execution fixtures,
no settlement transferred. All24 read-only tools passed real stdio MCP calls.
**238 Python / 431 Node pass; tools24/116 (92 actions).**

`attack_civ7_fleet` adds fixed Heavy/Light focused naval commands with exact role,
radius, ready deployed participant and native target checks. `observe_civ7_army_attack`
adds bounded group evidence to existing land commands. Observed actions now wait a
500ms captured-event quiet window before closing; quiet is not full-effect proof.
Native Light pair dealt65/retaliation30+24, then a distinct Heavy strike confirmed
the kill. Observed two-Field-Gun land Focus Fire dealt47 and consumed both attacks.
First Heavy test exposed early observation closure; fixed, never repeated or claimed
as a confirmed kill. Native effects, labelled setup, no HP/attack counter forcing.
Great Work deal offers remain API-blocked: two identical identity-free objects,
no safe per-work selection; no opaque or array-order write attempted.
**240 Python / 434 Node pass; tools24/118 (94 actions).**

`join_civ7_airlift` / `leave_civ7_airlift` pack/deploy exact Infantry through a
promoted Airborne Forces Squadron. `airdrop_civ7_infantry` uses the native Squadron
operation for one sole packed Infantry, exact visible empty land landing and full
membership/health/base preservation checks. Selected logistics supplies safe offers.
Native join, Airdrop `(22,11)→(23,12)`, re-pack and individual leave verified with
labelled XP/creation/readiness setup; no landing/membership effects forced. Multiple/
mixed payloads still reject. Separate FleetAirlift T62 save confirmed RESULT_OK;
original Merchant intact, no turns advanced.
**242 Python / 437 Node pass; tools24/121 (97 actions).**

`travel_civ7_unit` remains an optional strict mode, not the normal exploration
tool; use `move_civ7_unit` for ordinary fog-capable movement and queued travel.
It executes one1–8-edge current-turn native path with all edges
visible, empty, same-surface, reachable and noncombat. Explicit peaceful counterpart
intent additionally requires native no-war checks per edge, never inferred access.
Native Scout move and two-edge Frigate out/return into player1 verified with health,
peace and queue0 preserved. Spent-readiness return rejected before submission;
distinct return used labelled test-ship movement restoration, no turns/access forced.
**243 Python / 439 Node pass; tools24/122 (98 actions).**

Existing air-strike and grouped air-mission tools accept optional
`observe_effects=true`: bounded visible/owned-aircraft health changes, exact native
participant kills and500ms captured-event quiet, never complete hidden interception.
Native observed two-aircraft Ground Attack confirmed kill5439550 by8126564 with
both missions spent; separate individual strike dealt21 with memberships intact.
Labelled aircraft creation/post-transfer movement only, no HP/mission effects forced.
Observed Sweep/Bomb option fixture-tested, not yet positive native verification.
**244 Python / 441 Node pass; tool counts unchanged.**

Single-Infantry Airdrop also supports a Squadron holding aircraft: exact aircraft
health, missions, movement and packed membership must remain unchanged. Native
`(22,11)→(21,10)` drop preserved all three spent test aircraft. Spent-Squadron attempt
rejected without a write; labelled Infantry/Squadron movement restoration only.
Multiple Infantry/other ground payloads still reject.
**244 Python / 442 Node pass; tool counts unchanged.**

`airdrop_civ7_infantry_group` binds the exact complete2–7 Infantry payload and
requires an entirely visible empty safe seven-cell landing footprint. Native picks
individual cells; readback verifies every landing/health, one at selected target,
stationary base and retained aircraft/memberships unchanged. Distinct typed two-unit
drop to `(17,14)`/`(16,14)` verified after a separately labelled schema probe.
Creation/readiness prerequisites only, no landing effects forced or turns advanced.
**245 Python / 443 Node pass; tools24/123 (99 actions).**

`support_civ7_own_war` buys exactly one native-quoted token on the local side of
an exact ongoing war. Verifies token increment, other known counts, exact Influence
debit and stable Gold/war; never backs a third-party war or infers strength effects.
Native war78 support0→1 cost180; cap179 rejected. Labelled180 Influence budget fully
spent, original54.82421875 balance retained; next quote270. New separate MassAirTravel
T62 save confirmed RESULT_OK before this test.
**246 Python / 446 Node pass; tools24/124 (100 actions).**

District bombardment accepts optional `observe_effects=true`, keeping primary
district effects separate from visible garrison/nearby health. Native Field Gun
verified damage10→25 with nearby units and original Merchant unchanged.
Further native checks: Katyusha14 primary +3 adjacent splash; observed Fighter Sweep;
packed Squadron relocation; observed fortified Carpet Bomb0→33. Creation/readiness
setup labelled; no damage/eligibility forced. Fortified naval attempts rejected
before submission, no fallback. Full hidden/global effects remain unclaimed.
**247 Python / 447 Node pass; tool counts unchanged.**

Direct commander and empty-centre settlement assault/occupation also accept
`observe_effects=true`; no relaxed guards or automatic keep/raze. Native observed
Heroic Assault dealt40 with stable source/membership after labelled XP/promotions/
movement setup. Observed capture is fixture-tested only: no eligible empty revealed
centre, and one Tuner Town setup produced no city; no assault or retry submitted.
Separate BeforeObservedCapture T62 checkpoint confirmed RESULT_OK.
**248 Python / 449 Node pass; tool counts unchanged.**

`manage_civ7_alliance` provides separate native form/cancel intents with zero-cost
offer/zero-definition-penalty guards, bilateral flag and known-war/balance readback.
Native candidate3 is blocked by an alliance with our war opponent; existing
alliance1 preserved via verified no-op. Typed formation/cancellation effects remain
fixture-tested, not positive native. Real stdio MCP:125 opt-in tools, all24 default
read-only tools called successfully.
**249 Python / 451 Node pass; tools24/125 (101 actions).**

Existing hostile/targeted tools now cover loaded Modern Fake Artifacts, enemy-position
infiltration, space-program sabotage, and exact visible-city shipping sabotage/
ideological revolt. Same native offers/caps and owner-qualified guards; extended
withdrawal recognises them. All five currently report native “Action not unlocked”;
no starts or unlock bypass. The earlier synthetic Great Merchant was a placeholder,
not a representative positive-eligibility test for proper unique Great People.
**250 Python / 452 Node pass; tool counts unchanged.**

Proper Santa Anna activation now verified natively; its prerequisite is an Army
Commander on the same tile. `activate_civ7_commander_great_person` binds that exact
target and proves retirement plus5 levels/available promotion points, with local
inventory, armies, health and balances preserved. Distinct typed pair verified;
creation only, no bonus/XP forced. Other effect-specific profiles are separate work.
Latest MilitaryGreatPerson T62 checkpoint confirmed RESULT_OK; original Merchant,
Gold2081.33984375, Influence54.82421875 and alliance1 intact.
**251 Python / 454 Node pass; tools24/126 (102 actions).**

Commander Great Person activation also accepts `effect="heal"` for Morelos. Native
tests showed healing beyond the selected Army's radius, including distant packed
units; readback now reports additional owned heals instead of promising outside
health stays unchanged. Distinct synthetic-injury case verified primary and wider
healing, source retirement and preserved experience/ledgers/balances. Earlier
exclusive-radius checks remain UNKNOWN and were not retried. Exact future/ongoing
healing semantics remain unproven; no turn advanced or healing result forced.
New Morelos T62 save confirmed RESULT_OK; original Merchant/balances/alliance intact.
**252 Python / 455 Node pass; tool counts unchanged.**

`respond_civ7_hostile_project` handles exact revealed incoming sanctions separately
from cooperative replies, with native offered response/cap, exact Influence debit
and stable Gold/peace/alliance checks. Positive execution remains fixture-only:
one synthetic incoming setup produced no visible event; no reply or retry followed.
First-meet remains unimplemented: native permission is true even without a pending
choice, so a permission-only handler would be unsafe.
**253 Python / 456 Node pass; tools24/127 (103 actions).**

Commander GP activation also supports `effect="combat_gold"` for Villa. Native
activation added exactly `ABILITY_VILLA` to the chosen Army Commander, preserving
prior abilities, experience, health, inventory/armies and balances. Creation-only
setup; future combat Gold payouts remain unverified, not implied by the grant.
**254 Python / 457 Node pass; all24 default tools freshly called over real stdio.**

`respond_civ7_first_meet` now binds an actual blocking `NOTIFICATION_PLAYER_MET`
notice, fresh diplomacy token, fixed greeting and native cost/delta/cap—not merely
permissive native permission. Initially restricted to peaceful/nonallied zero-
relationship/empty-history profiles (restriction removed below); GameStarted
required, unknown/ambiguous/stale notices reject.
Native friendly
reply to Hatshepsut verified20 Influence spent, relationship0→20, notice cleared and
Gold/peace/alliance stable; neutral verified zero-cost/zero-delta notice clearance.
An unfriendly request timed out behind Begin, then its exact20 debit/−20 relationship
and notice clearance were observed after Begin without resubmission. Original
UNKNOWN retained; fresh fully-started bounded unfriendly verification remains open.
New guard live-rejected at Begin; loading is not inferred from isInGame alone.
Contact used
labelled test Scouts/readiness, not forced contact or response; no turns advanced.
User's Maya original and Modern/T62 checkpoint preserved; all16 original Maya units
unchanged. Pending/friendly/unfriendly/final guarded branches saved separately with
RESULT_OK; friendly+20 state restored, still T1. Other write families' loading gates
were not audited here.
**255 Python / 462 Node pass; tools24/128 (104 actions); all24 default tools pass real stdio.**

**First-meet modifier fix:** a genuine pending peaceful/nonallied greeting is no
longer marked unsupported just because relationship is nonzero or its history is
nonempty. Native permission, quotes, affordability/cap, GameStarted readiness and
exact notification binding still apply. The fresh token now binds the actual
history as well as relationship; both are rechecked before the single submission.
Readback still requires notification clearance, the quoted change from the
captured relationship baseline, exact Influence debit and stable Gold/peace/alliance.
Unexpected additional effects remain unknown, never an automatic retry. Existing
modifiers are fixture-tested only; no live probes, greetings or turns were issued
for this fix. Refresh diplomacy for a new token after loading the updated server.
Regression verification: **274 Python /497 Node tests pass**.

Scope update and closeout, 2026-11-07: **Group 1 is closed under the user's revised
no-additional-setup boundary.** All104 MCP writers now share a GameStarted gate
before submissions, readbacks and helper initialization; read-only queries remain
unchanged. Interrupted verification stays UNKNOWN and never resubmits. No new game
setup or turns used for this audit. **260 Python /462 Node pass; all24 default tools
pass fresh real stdio calls; tool counts unchanged.**

Work needing another save, additional game-state/debug setup or missing eligibility
is explicitly deferred to Group 2, including unimplemented variants as well as
verification gaps. Hard build/API limitations are unsupported, not Group 1 blockers.
This does not mark deferred handlers complete or authorize Group 2/turn advancement;
see the current closure checklist in `docs/civ7-action-backlog.md`.

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

`religiousUnits` adds proven owned units with positive definition `SpreadCharges`, their native current-state spread-operation eligibility/failure reasons, charge quotes and action-panel `additionalDescriptions`. Zero remaining charges remain zero; missing charge data remains `null`. Deployment checks use owned commander/army membership and `isOnMap`, not coordinates alone: packed/off-map units and units with unavailable/inconsistent packing evidence are not queried as deployed missionaries, even if their coordinates look valid. A withheld location does not prove packing. Foreign army members and unit inventories are not inspected/exported. This uses the action panel's non-target check, not hypothetical destination coordinates: arbitrary missionary-target eligibility, conversion counts/forecasts and custom ability variants remain unverified. Native text is retained without parsing it into an outcome. Native target plots are not exported and no spread action is issued.

The inspected `Game.Religion`, local player Religion and owned-city Religion interfaces expose belief/identity/current-state data, not a verified pure conversion-outcome preview. The Modern T58 save has no religious units, so positive spread/conversion behavior is fixture-tested or unverified as appropriate; no missionary, target scenario or religious action is manufactured to fill the gap.

### Great Work inventory and relocation

Call `get_civ7_great_works` without arguments for owned displayed/archived works with stable `works[].instanceIndex`, owned building capacity, damage and current Great Work yield totals. Supply `great_work_index` from that inventory to check one owned instance's native destinations. Archived works omit `SourceCity`; displayed works retain it, and the native destination is a building type rather than a component ID, matching the UI. `availableNow` also requires empty capacity, an undamaged source/destination and a different destination; native permission alone is not enough. Foreign/ambiguous indices are rejected. No UI model is initialized and nothing is selected, moved or archived.

Building yield totals cover the six yield families used by the Great Works UI and are **current whole-building totals**, not the selected work's contribution or a marginal relocation forecast. Targeted destinations additionally carry `cityWorkTypeYieldQuote: {workType, yields, buildingSpecific: false}` from the tooltip's pure `getYieldFromGreatWork(yieldType, definitionIndex)` getter. The input is a loaded work **definition index**, not the owned instance index; quotes are read once per destination city for the selected owned work type, not as an all-work matrix. They describe the current native city/work-type quote, not an instance-specific or destination-building-specific applied effect. Missing getters/indices return `null`, missing yield amounts remain `null`, and native zeroes/negative quotes are retained. Eligibility/capacity/damage remain separate: a quote does not make a blocked move available.

Do not add quotes to whole-building totals or subtract source/destination quotes into a claimed net gain: building effects, cross-yield/empire effects and the future state after removal/placement are not evaluated. `netYieldChange` stays `null`; occupied-slot swaps and archive actions are not modeled. This separate query is not added to snapshots; existing settlement Great Work summaries remain available there. Modern T58 live reads verified the displayed artifact's positive Museum/Hermitage relocation eligibility and a native Culture quote of 4 in both Bàakʼ and St. Petersburg; equal quotes do not prove zero net relocation impact. Nothing was moved, selected or archived. Archive/blocked/full/damaged/missing-API cases remain fixture-tested.

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

Each yield also includes `baseIncomeEvidence`: the native detailed income base's `value`, its top-level named `sources`, their `listedTotal`, and `residual` (base minus listed total). Sources are used only when the native base is explicitly an `ADDITION` with a supplied step list. Missing details produce `null`; missing/nonadditive decomposition or unknown source amounts leave sums/residuals unknown, not zero. Unnamed steps are retained, repeated names are not merged, genuine zeroes are preserved and negative residuals aren't clamped away. `matchesSummary` compares this separate detail read's base with the existing income summary; false flags an observed difference, while true does not make sequential reads atomic. Raw IDs, contexts, nested operands and calculation trees are withheld.

This is an **alternative explanation of the same base income**, not extra yield to add to `sources` or `otherBaseIncome`. It can name effects missed by the fixed category list: live Modern T58 reads exposed “From City-States,” “Star of the North” and “Yield per Connected Settlement,” as well as native current policy/effect labels such as “Bourgeoisie.” All 99 available base-income records across 16 settlements reconciled to their source lists in that read; 13 missing base records stayed unknown. This is not a guarantee of complete attribution on other saves/rulesets.

`incomeAdjustment` is the observed native gross `income.value - income.baseValue`, in yield units per turn, retaining penalties and engine rounding rather than recomputing a percentage formula. It excludes signed deductions and is already included in gross income—not an additional amount to add to the net. Read it alongside the existing named percentage modifiers to inspect current bonuses/penalties. Source labels are observations, not stable card identifiers, exact per-policy attribution or predicted gains from removing/swapping a card. Existing `otherBaseIncome` retains its fixed-category residual meaning for compatibility. These fields extend settlement snapshots/exports; no new tool, policy selection or preview request is added.

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

Route rows include exact native `targetPlayerId` and `targetCityId`; pass them as
`target_player_id` and `target_city_id` to `establish_civ7_trade_route`. The reader
uses the same `INCLUDE_FAILED + EXTENDED_STATUS` inventory as the writer, including
active routes. Returned IDs must match the offered component's owner/ID/type and
the resolved city; malformed or stale bindings are omitted rather than inferred
from a name, location or list position. City numbers can repeat under different
players, so always use the owner-qualified pair. Submission still rechecks the
exact Merchant, revealed city, native availability and current turn.

Identity follow-up verification: **266 Python /484 Node tests pass**, and all
**25 default tools** passed fresh real stdio calls. Live Exploration T1 readback
returned Washington, D.C. as player 4/city 65536 with an already active route;
another player's city independently used 65536. No trade route or game action
was submitted to obtain this evidence.

### Scout auto-explore

Use `set_civ7_unit_order(unit_id, "auto_explore", expected_turn)` to explicitly
enable native auto-exploration for one owned, on-map `UNIT_SCOUT` in single-player.
This submits `UNITOPERATION_AUTOMATE_EXPLORE` once with the native UI's non-target
arguments, not assistant-chosen destinations or a scripted exploration loop. A
different existing order may be replaced if natively permitted. Native failures
and confirmation requirements are respected; already-active automation is a no-op.

The engine may move that Scout immediately and on later user-advanced turns.
It may encounter danger or stop; future coverage, safety and arrival are not
predicted. Use `cancel` or `wake` through the same tool to stop the order. The
tool itself never advances turns, enables autoplay, chooses first-meet replies
or automates other units/empire decisions.

Activation readback requires the exact native `AUTOMATE_EXPLORE` operation in
progress or queued, not merely changed coordinates or an arbitrary queue. It is
bounded to 15 seconds; unknown/cancelled outcomes are never automatically retried.
`get_civ7_units.units[].autoExplore` reports Scout-only native permission/blockers
and nullable active-operation evidence. This read-only inspection never enables
auto-explore. Non-Scouts are outside this writer's scope even if their native UI
offers automation.

Verification: **271 Python /491 Node tests pass**. Activation/replacement/blocker
and exact-operation readback cases are fixture-tested; future-turn exploration
has not been live-verified. No live probes, Scout orders or turns were issued
while the user played in another session. Tool counts remain **25/130 (105 actions)**.

### Normal movement and exploration

`move_civ7_unit` submits one ordinary native `MOVE_TO` to the user's exact x/y.
It uses `MOVE_IGNORE_UNEXPLORED_DESTINATION`, which the installed native Move-To
picker uses so humans can click into fog. Sidkick submits that flag **without**
adding `ATTACK` or calling the UI's broader attack/war helper.
Fogged/unexplored destinations, multistep/queued continuation, native shore
crossings and native-permitted peaceful access are allowed. An explicit new
destination may replace an existing movement order; zero remaining movement
does not by itself block queuing. No full-path visibility, empty-tile, terrain,
packing-army scan or predicted danger-free-route proof is required.

The default still checks native permission, confirmation/war requirements,
visible combat targets, unit ownership/type, valid map coordinates and current
turn/Age context. It does not call the UI helper that can attack, swap or declare
war, inspect hidden occupants/terrain, or advance turns. Civ7 may stop short,
reveal danger, apply attrition or continue its queued order when the user advances
later turns. Unknown territory is **not** promised safe for a Settler.

Readback distinguishes `verified_applied`/`outcome: "arrived"` (actual coordinates),
`verified_partial`/`"moved_partway"` (movement observed without arrival), and
`submitted`/`"move_order_observed"` (a native MOVE_TO is active/queued). The last
is not a rejection and must not be resubmitted: `queuedTargetVerified: false`
explicitly records that the known queue API does not bind its exact destination.
Future arrival is not verified. Missing units, changed context, timeout or lost
acknowledgements remain unknown and are never automatically retried. Native
rejections are distinguished from Sidkick guards by `rejectionSource`.

The stricter `travel_civ7_unit` remains available only when its visible/empty,
bounded current-turn guarantees are explicitly wanted. Air, rail and commander
movement retain their separate tools.

Verification: **270 Python /488 Node tests pass**. This change is source/fixture
verified, not positively live-movement-tested. No live probes, game actions,
turns or save/load operations were issued while the user played in another
session. Tool counts remain **25 default /130 opt-in (105 actions)**.

### Centered ASCII map

`get_civ7_ascii_map(x, y, width=15, height=9)` returns a north-up, connected hex
honeycomb in `ascii`, plus its legend, bounds, settlement/unit lists and
entity-lookup coverage. Choose the center tile of the area you want to inspect.
Width and height must be odd, at most 31 and 21 respectively (651 tiles maximum).
Edges are clipped, not wrapped or shifted to fill the requested size. Absolute
odd-numbered rows shift right, matching the native map debug renderer.
Hex outlines share edges: there are no decorative gaps between neighboring tiles.
The outlined view is taller than the original compact triplets; width/height still
refer to map tiles, not text characters/lines. Coordinates label each tile-content
row, and the terrain/entity/visibility triplets remain unchanged inside the hexes.

Each cell contains **terrain / entity / visibility**, for example `^U.` is a
currently visible hill with an owned unit, and `M :` is an explored, fogged
mountain with current entities withheld. `???` means unrevealed/unknown visibility.
Terrain: `.` flat land, `^` hills, `M` mountains, `~` coast, `O` ocean and `=`
navigable river. Overlays: `C/c` own/met foreign city centre, `U/u` own/met foreign
nonwar unit, `!` met enemy unit, `.` no displayed entity, `?` unavailable entity
lookup. City markers take precedence; units on those tiles remain in the unit list.

Explored base terrain is included under fog, marked `:` rather than the visible
`.`. No terrain getters run for hidden/unknown tiles; no city/unit lookups run in
fog. Foreign entities require a met owner, and units also require individual
visibility and matching on-map coordinates. Districts are not labelled as city
centres. Missing markers never prove a tile is empty or safe. This view omits
features, biomes, resources, yields and movement/path forecasts, rather than
reading current hidden details or inferring remembered changes.

This is a separate read-only tool, not an addition to snapshots/exports or a
full-world scan. Reconnect Sidkick when idle to load its registration. Verification
is local source/fixture testing only; no live map probes or game actions were used.
**280 Python /512 Node tests pass**. Tool counts are
**26 default /132 opt-in (106 actions)**.

### Movement and founding-site evidence

`get_civ7_units` includes a stable numeric `instanceId`, distinct from the existing unit-type `id`. Pass it to `get_civ7_movement_and_founding`, optionally with **both** `x` and `y`. Without coordinates, it inspects the unit's current location. Only owned units and valid map destinations are accepted. Explicit fog/unexplored destinations may receive native fog-capable move-permission checks; hidden site/terrain/resource data remain withheld, and absence of a visible path does not establish illegal movement. The tool returns revealed movement-range candidates, per-tile operation eligibility, and the engine's path turn labels without converting them to an inferred number of turns remaining. Attack targets are excluded from movement candidates; packed units and units stopped by a zone of control do not receive an unrestricted range. A path containing any hidden tile is withheld in full, and raw path obstacles are never returned.

Settlers include the engine's current-location and adjacent-plot founding checks. A destination also includes fresh water, terrain/features, current tile yields, resources already revealed within three hexes, and distances to owned settlements. These are **site-comparison evidence**, not a founding-site simulator: arbitrary `legalToFoundAfterMoving` and `newSettlementYields` remain `null`. Current/adjacent founding eligibility is not extended to distant tiles. The tool does not use AI settlement recommendations that could incorporate hidden-world information, and never selects, moves or founds anything. This targeted query is excluded from snapshots/exports.

### Unit state and snapshot compatibility

`get_civ7_units()` adds nullable `isPacked` and `isReinforcing` flags to each proven-owned unit. `true` means native membership/assignment evidence was found; `false` means absence was observed; `null` means evidence is unavailable. Packing uses only owned commanders' owned armies and matches the unit component identity, not a colliding foreign ID. If any commander's membership is unknown, unmatched units have `isPacked: null`, while positive membership remains known. No owned commanders means known-empty packing evidence.

The existing `packedInCommander` name and `reinforcingCommander` native army ID remain available. A null legacy field alone does not distinguish absence from unknown; use the flags. Reinforcement ID zero is valid, the native `-1` sentinel means not reinforcing, and missing getters/invalid values stay unknown. Missing packing/reinforcement APIs do not discard otherwise readable unit data. Locations are withheld for packed/off-map units, unknown packing state, and missing/invalid coordinates; a withheld location does not prove packing. Health, movement and promotion evidence remain separate from deployment.

These per-unit fields pass through snapshots and exports unchanged. `snapshotStatus.complete` still describes successful domain collection, not certainty of every optional field. Unknown flags are not rewritten as false, and export consistency/safety gates are unchanged.

### Military logistics and visible foreign settlements

`get_civ7_military_logistics()` reads owned commanders (including carrier/squadron/aerodrome commanders), their native combat/noncombat capacities, proven-owned packed-unit IDs, air-unit inventory, reinforcement assignments/native arrival quotes and WMD stockpile counts. Capacities are not inferred free slots. `nativeArrivalTime` preserves the engine quote without converting it to an absolute turn or a guaranteed number of turns remaining. Missing counts/interfaces stay unknown; zero stockpiles remain zero. Foreign packed members and raw reinforcement paths are not returned.

Missing commander/army membership getters or records leave `packedUnitIds: null`, not an empty membership list. If any owned commander's membership is unknown, deployment checks and locations are withheld conservatively; a withheld location does not prove packing. Missing reinforcement assignment APIs return `reinforcements: null`; a missing arrival getter retains known assignments with `nativeArrivalTime: null`.

Optionally pass `unit_id` from `get_civ7_units` to check that one owned unit's distinct native `REBASE` (air units) and `REINFORCE_ARMY` (packable non-commanders) operations. Options are deduplicated native destinations filtered to valid explicitly `REVEALED`/`VISIBLE` tiles; missing visibility getters/enums and unknown visibility values withhold destinations, without discarding a known native operation permission. An empty options list does not prove there are no eligible destinations. Native failure reasons are retained and a failed check never creates positive destinations. Packed/off-map units are not queried as deployed, even if their coordinates look valid. `travelTurns` stays `null`; no mission range, future base compatibility, WMD launch eligibility, damage or diplomatic consequence is simulated. Nothing is packed, moved, rebased, reinforced or launched. This focused query is separate from snapshots/exports and does not create an all-unit destination matrix.

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

### Civilopedia reference lookup

`get_civ7_civilopedia` is read-only and available by default. It reads the loaded
game's public Civilopedia definitions/localization, including loaded mod/DLC
changes, rather than substituting remembered mechanics or a web encyclopedia.

- No arguments: list public section IDs.
- `query: "University"`: search; optionally restrict with `section_id`.
- `section_id: "BUILDINGS"`: browse a section.
- `section_id: "BUILDINGS", page_id: "BUILDING_UNIVERSITY"`: read the exact page
  returned by search/browse. Ambiguous search results are never auto-selected.
- `limit` is 1–20; `offset` paginates bounded results. Native search uses an
  existing index only (up to 100 candidates); title/ID matching still works if
  that index is unavailable. The tool never initializes or changes the UI index.

Articles retain localized chapter headings/paragraphs, localization keys and
source labels, public scalar definition fields where supported, and bounded
unlock-node/depth, required-constructible and civilization-association references.
UI exclusions are honored; no player inventories or hidden game identities are
read. Native markup is returned as text. Only guarded, row-bounded SELECT queries
from installed Civilopedia definitions execute; callers cannot supply SQL.

Inspect `complete`, `warnings` and chapter `contentAvailable` before relying on
the result. Unsupported query shapes, failed/missing localization and truncation
are explicit. Article output is capped at 20 chapters, 64 paragraphs, 4000
characters per paragraph and 24000 chapter-text characters; query rows, catalog
size and requirement-link lists are also bounded. Graphical sidebars and every
derived modifier/statistic are not recreated.

**This is reference evidence, not a live requirement evaluator.**
`article.requirements.complete` is always false and `evaluatedEligibility` null:
unlock sources are not presumed to be an AND chain, empty lists do not prove no
requirements, and definition costs are not runtime purchase quotes. Use the
relevant live decision/placement/research tools for actual legality. Civilopedia
lookups are intentionally excluded from broad snapshots.

Verification: **266 Python /481 Node tests pass**; all **25 default tools** passed
fresh real stdio calls, including Civilopedia section browsing, exact-ID search
and article reads. Opt-in registration is **130 tools /105 actions**. Live
Exploration T1 reads verified the University article with its Education unlock
reference, Merchant text and Ocean Exploration paragraphs. No UI screen was
opened, search index rebuilt, profile contacted or game action/turn issued.

### Dedication card selection

`get_civ7_age_transition.dedications` reports native `deckSize`, `openSlotCount`,
`selectionOpen`, `phase` (`selecting`, `full_unconfirmed`, `completed`, or `unknown`),
legacy-point balances, add/remove eligibility and a fresh `deckToken`. A completed
deck reports zero open slots even if some capacity was unused. Counts describe
native deck capacity, not a focused or numbered UI slot. The core snapshot also
uses native slot counts instead of assuming three.

Opt-in `edit_civ7_dedication` accepts one exact `card_id`, `operation: "add"` or
`"remove"`, the current `deck_token`, `max_legacy_point_cost`, and `expected_turn`.
It requires a fully started active single-player turn and an open deck, checks
native eligibility, current costs and the final token before submitting once,
then verifies the selected-card multiset and total legacy-point debit/refund.
Individual categories may use native wildcard substitution; category allocation
is not predicted. Negative/unknown costs and ambiguous repeated selected IDs are
unsupported. Unknown/cancelled outcomes are never automatically retried.

**This edits card selection only.** It does not open a screen, apply card effects,
change the capital, replace another card automatically or confirm/finalize the
deck. Those are separate native operations, not a side effect promised by a
successful selection. It does not unlock a completed deck or advance turns/Ages.

Verification: **264 Python /474 Node tests pass**; all **24 default tools** passed
fresh real stdio calls, and opt-in stdio advertises **129 tools /105 actions**.
Live Exploration T1 reads confirmed the existing completed 3/3 deck has zero open
slots. Positive add/remove execution remains fixture-tested: the live deck was
not reopened, edited or finalized, and no game actions or turns were issued.

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

`get_civ7_victory_progress` adds `victoryAlerts` for local, met-player and anonymous unmet-player dominance countdowns and upcoming easing of dominance ratios. Each victory's `dominanceSchedule` reads the loaded `VictoryDominationPercents` rows matching the campaign starting Age and previous-Age count, and reports all tiers plus the current and next tier. A `DominationPercent` of 300 means **4×**, not 3×; 100 means **2×**. In the inspected rules, relevant Modern campaign paths can ease from 4× to 3× to 2× and lower as Age progress increases. Do not plan around a permanent remembered ratio. The previous lost game's exact cause has not been reconstructed from its save.

Native `targetPoints` and countdown/prerequisite readings remain authoritative; the tool never recomputes a global target from only met rivals. Tier boundaries are Age-progress percentages, **not turns until a change**. Countdown turns remaining are conditional on continued qualification, not guaranteed victory dates. Unknown countdown/requirement values stay `null`, not invented zeroes. Missing schedules/configuration do not become a default 1× rule. Public `scoringRules` include non-project sources such as wonders/Great Works, definition points, activation flags and scoring arguments. These describe conditional loaded rules, not proof of local activation or a complete dependency simulator. The original tier-warning increment was source/fixture-verified with the game closed; live threshold-change/countdown verification remains separate.

The public victory scoreboard now includes every living major, matching the native victory UI. Unmet entries have `hasMet: false`, `displayName: "Unmet player"`, and null leader/civilization/team fields. Their `points` and countdown progress/remaining turns are exported, including countdown alerts; scoring history, prerequisites and completed-victory status remain `null` and are not inspected. Numeric `id`/`playerId` values only join scoreboard rows; they do not identify an unmet leader or civilization. Local/met-player detail is unchanged. Culture victories explicitly use `pointsLabel: "Tourism"`: these are victory-score totals, **not Culture yield or a per-turn Tourism rate**. Other victory classes use `"Victory points"`. Diplomacy and known-world visibility are unchanged.

Live read-only Exploration T1 verification returned two anonymous unmet majors with 13 and 72 Tourism; identities, history and prerequisite details stayed null. Positive unmet dominance-countdown alerts remain fixture-tested, not observed active in that save. **261 Python /466 Node tests pass.** No game actions or turn advancement were used.

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
