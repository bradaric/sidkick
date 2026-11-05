# Can Sidkick play Civilization VII through an API?

Investigation date: 2026-11-05. Repository baseline: `e7821b9`.
Installed Steam app: `1295660`, build `25516395`.

## Verdict

**Yes, there is a credible technical route to API-driven gameplay.** The installed game's own UI submits gameplay requests through JavaScript interfaces accessible over the same FireTuner connection Sidkick already uses. This is substantially more promising than automating mouse clicks.

**No, Sidkick cannot play the game today.** Its 23 MCP tools are read-only. No gameplay action was executed during this investigation, so successful writes, reliable turn automation and an unattended full campaign remain unproven.

The distinction is:

| Question | Finding |
|---|---|
| Can the existing transport carry game-changing JavaScript? | Yes; it evaluates JavaScript, not a read-only query language. |
| Are actual gameplay request methods accessible in the running game? | Yes; live presence inspection confirmed all five request families and turn completion. |
| Does the installed UI use them to play? | Yes; source inspection found concrete action handlers across most major systems. |
| Are those actions exposed by Sidkick? | No. |
| Have writes through Sidkick/FireTuner been demonstrated here? | No; this investigation deliberately issued none. |
| Can an AI reliably complete an entire campaign without intervention? | Not established; action execution, completion detection and exceptional choices need validation. |
| Is this a supported external REST API or a headless game engine? | Neither is established. This route requires the running game and its internal JavaScript/debug environment. |

## Evidence and limits

I inspected Sidkick's connection, query registrations, tests, existing coverage audit, bundled FiretunerTerminal, and the installed game's UI JavaScript. The working tree was clean before this report.

A one-shot read-only diagnostic against `127.0.0.1:4318` observed turn **58**, local player **0**, and an active local turn. It inspected function types only:

| Interface | `canStart` | `sendRequest` |
|---|---|---|
| `Game.PlayerOperations` | function | function |
| `Game.CityOperations` | function | function |
| `Game.CityCommands` | function | function |
| `Game.UnitOperations` | function | function |
| `Game.UnitCommands` | function | function |

`GameContext.sendTurnComplete`, `GameContext.hasSentTurnComplete`, and `Game.Notifications.getEndTurnBlockingType` were also functions. **None of the request or turn-completion methods was called.** Method presence is not proof of successful action execution, permission in another phase, or multiplayer compatibility.

Installed-game references below are relative to:

`~/.local/share/Steam/steamapps/common/Sid Meier's Civilization VII/Base/modules/`

These are internal, version-dependent contracts. Database hashes, definition indices, instance IDs and owner-qualified component IDs are not interchangeable.

## What the write surface covers

Every row below is **source-confirmed**, not a live-tested write. Existing Sidkick reads can inform many actions, but their output is not yet a complete executable action schema.

| Gameplay area | Installed request path | Readiness / important qualification |
|---|---|---|
| Select technology or civic | Player `SET_TECH_TREE_NODE`, `SET_CULTURE_TREE_NODE` | Good narrow candidates. UI supplies `ProgressionTreeNodeType` and checks `canStart` immediately before sending. |
| Produce units, buildings, wonders and projects | City operation `BUILD` | Existing decisions/placement reads help. Constructible, unit and project arguments differ; placed buildings need exact coordinates. Queue insertion/replacement semantics need explicit handling. |
| Purchase; upgrade town to city | City command `PURCHASE`; town upgrade uses `ORDER_TOWN_UPGRADE` | Real treasury spending. Recheck exact cost, affordability, placement and target at commit time. |
| Change town focus | City command `CHANGE_GROWTH_MODE` | Existing read surface is relatively close. Project selectors use hashes, not arbitrary numeric indices. |
| Place population / assign specialists | City command `EXPAND`; player `ASSIGN_WORKER` | Distinct actions and argument shapes. Need ready population and exact valid plot, not just an improvement preview. |
| Assign or swap resources | Player `ASSIGN_RESOURCE`, `SWAP_RESOURCES` | Existing assignment checks help. Map/off-map identity must remain distinct; not all commerce UI helpers are pure. |
| Government, celebration, policy cards | Player `CHANGE_GOVERNMENT`, `CHOOSE_GOLDEN_AGE`, `CHANGE_TRADITION` | Must enforce actual pending-choice/slot rules. Policy changes are sequenced, not established as an atomic full-loadout replacement. |
| Buy attributes / promote units | Player `BUY_ATTRIBUTE_TREE_NODE`; unit command `PROMOTE` | Existing choices/checks help. Spending points can be permanent; repeatable prices and actual remaining balances need fresh checks. |
| Move, found settlements, perform civilian actions | Unit operations, including `MOVE_TO` and data-driven actions | Broad surface. Separate movement from attacks, war, swaps and other contextual behaviors. Founding is not undone by moving back. |
| Attack, pillage, commander actions | Unit operations/commands, including ranged/naval/air attacks and commander attack | Entry points exist. Sidkick does not currently provide verified numerical combat outcomes. War and destructive actions need their own approval. |
| Pack/unpack, reinforce, rebase, rail transport | Separate unit commands/operations | Not equivalent to ordinary movement. Current owned-unit/logistics reads provide part of the validation evidence. |
| Establish trade route | Unit command `MAKE_TRADE_ROUTE` | Exact Merchant and destination check required. The UI may instead move the Merchant when immediate establishment fails; that fallback must not be silently copied. |
| Found religion/pantheon, choose belief, spread religion | Player `FOUND_RELIGION`, `FOUND_PANTHEON`, `ADD_BELIEF`; unit operations | Founding bundles choices; spread is unit/ability/target-specific. No verified conversion-outcome forecast exists in Sidkick. |
| Excavation / artifact research | Data-driven unit operations `UNITOPERATION_EXCAVATE`, `UNITOPERATION_RESEARCH_ARTIFACTS` | Starting an order is different from finishing it or receiving an artifact. Existing readiness checks do not expose a complete active-order lifecycle. |
| Relocate Great Works | Player `MOVE_GREAT_WORK` | Owned instance/destination checks already exist. Source city is omitted for archived works; instance and definition indices differ. Swaps/archive operations are not established by the current query. |
| Diplomatic projects / city-state bonuses / war | Player operations, selected project operation types, `CHOOSE_CITY_STATE_BONUS`, `DECLARE_WAR` | Secondary targets, costs and pending phases complicate execution. Existing diplomatic choice lists are intentionally partial. |
| Negotiate peace deals | `Game.DiplomacyDeals` working-deal mutation and `sendWorkingDeal` | Source shows propose/adjust/accept/reject paths. This is a separate stateful workflow, not just one generic player request; current enacted-deal read coverage is incomplete. |
| Respond to narrative events/crises | Player `CHOOSE_NARRATIVE_STORY_DIRECTION` | Exact pending story and choice identity required. Ordinary choices are readable; trial-specific choice coverage remains incomplete. |
| End turn | `GameContext.sendTurnComplete()` | Direct entry point exists. Need blockers, active-turn/sent status, pending requests and next-turn completion handling; merely calling it is not a turn controller. |
| Age transition / Dedications / Mementos | Setup parameter setters, advanced-start operations, `SET_AGE_TRANSITION_DATA` | Multiple phases and UI contexts. Memento UI also reads online progression and can mark items seen. Do not initialize it as an innocent query. |
| WMD | Unit `UNITOPERATION_WMD_STRIKE` | Source-confirmed, high-consequence action. Stockpile reads do not supply launch authorization or a verified consequence forecast. Exclude from an initial write surface. |

Game setup, save/load automation, shell navigation and a truly headless runtime were not fully audited. Nothing here establishes that every popup, DLC mechanic, game mode or campaign boundary can be handled without a human.

## How the connection would work

The existing route is already sufficient in principle:

```text
AI client -> typed MCP action -> local Python adapter
          -> FireTuner JavaScript -> native gameplay request -> running game
```

The normal UI pattern is `canStart(exact target, exact action, exact arguments)` followed by `sendRequest` when `Success` is true. Sidkick currently uses the first half only.

That does **not** mean we should expose arbitrary JavaScript or a generic operation-name dispatcher. Narrow typed actions would let the adapter enforce ownership, phase, visibility, spending limits and action-specific approval. The existing read-only tools should remain unchanged and the write capability should be disabled by default.

There are two separate implementation problems:

- **Execution:** validate, submit exactly one requested action, and establish what happened.
- **Autonomous play:** repeatedly interpret the game, resolve every mandatory decision, manage units and economics, end turns, and recover from unusual states without unauthorized actions.

The first is a credible bounded extension for selected actions. The second is a substantially larger project. Broad API coverage does not imply good strategic play or reliable unattended execution.

## Specific hazards found

### 1. Read-only is a Sidkick contract, not a FireTuner security boundary

[`civ7/connection.py`](../civ7/connection.py) restricts scripts to the adapter directory and JSON-encodes selectors. [`sidkick/server.py`](../sidkick/server.py) exposes fixed query functions. The transport itself executes JavaScript; `readOnlyHint` is descriptive metadata, not engine-enforced protection.

The installed tuner UI even contains `CREATE_ELEMENT`/`DESTROY_ELEMENT` requests. Those are debug/cheat capabilities, not a suitable gameplay API. A write extension should allow only verified normal-player actions and preserve the existing hidden-world restrictions. Legitimate exploration into unknown territory would need a distinct validated movement contract, not permission to inspect hidden tiles.

### 2. UI helpers can bundle additional actions

`base-standard/ui/world-input/world-input.js:412` implements `requestMoveOperation`. It branches into naval/air/ranged attacks, army overrun and unit swapping, applies attack/unknown-destination modifiers, and checks for war declarations. It is not a safe generic "just move this unit" wrapper.

Likewise, trade-route selection can fall back to movement, and policy changes can involve several requests. Typed actions must report and authorize the actual effects rather than inherit a UI helper's hidden fallback behavior.

### 3. A timeout can mean an action already happened

The bundled terminal's [`ConnectionManager._send_via_tuner`](../civ7/FiretunerTerminal/civ7_terminal/connection.py) retries timed-out JavaScript through a CDP fallback (lines 233–266). That can duplicate an irreversible or costly action if the first execution succeeded but its response was lost. **Do not reuse that retry behavior for writes.**

Sidkick's current `run_script` opens a direct socket and has no such fallback. However, its 12-second response timeout would still leave a future write's outcome uncertain. An MCP/tool retry by a client is another duplication risk.

An action ID and a local execution record could help deduplicate client requests, but cannot manufacture exactly-once native execution across crashes. After an ambiguous submission, reconcile against fresh game state; otherwise return **unknown outcome** and stop. Never blindly resubmit.

### 4. Native permission is necessary, not sufficient

The existing government investigation observed that native permission could succeed without a pending government choice; Sidkick therefore adds a pending-phase gate. Similar UI/phase restrictions must be understood per action. A successful generic `canStart` is not blanket permission to bypass normal pickers or timing rules.

Fresh validation is needed immediately before submission: local player/active turn, owned component identity, action phase, exact arguments, costs, and relevant pending choice. Turn/Age/player markers alone do not detect all same-turn edits or another save with matching markers.

### 5. Submission is not completion

The inspected handlers often submit a request and then update UI state or listen for events. The policy UI waits for `TraditionChanged` before sending the next change. A FireTuner response can show that JavaScript ran, not that movement, production, an excavation or an Age transition finished successfully.

Future action results should distinguish rejected, submitted, verified-applied and unknown outcomes. One outstanding action at a time, bounded observation and action-specific postconditions are safer than a batch of unobserved writes. No atomic rollback or general undo contract was established.

### 6. Remote exposure changes the risk

Sidkick supports local stdio, HTTP and a managed ChatGPT tunnel. Enabling writes on an existing transport is an access-control change: a connected client could spend resources, destroy units, declare war or advance the campaign. Keep writes opt-in and locally constrained, with explicit approval for each consequential action. MCP annotations or model instructions alone are not authorization.

Single-player with a disposable save is the appropriate initial validation setting. Multiplayer/hotseat transport behavior, other humans' turns and online/profile effects are not certified by this audit.

## Recommended scope

**A human-approved copilot is the sensible first target, not unattended full-campaign play.**

Selecting one technology/civic is a good first write candidate: a small argument shape, a direct picker-equivalent eligibility check, no spatial UI dependency and an observable active-research postcondition. It still changes the save and requires separate approval to implement and to execute a live test.

Town focus and a single validated production selection are plausible next candidates after their replacement/queue semantics are verified. Treasury spending, movement, founding, combat, diplomacy, multi-request policy changes, turn advancement and Age transitions carry additional risks and should not be silently bundled into that first scope.

Before any live experiment, the user should arrange a disposable save/checkpoint and approve the exact action and expected effect. The test must submit only that action, inspect its outcome, and stop on uncertainty. This report does not authorize implementation, saving/loading, or gameplay writes.

## Source index

Representative installed sources inspected directly:

| Area | Source and anchor |
|---|---|
| Research | `base-standard/ui-next/screens/choosers/tech-chooser/tech-chooser.js:95`; `culture-chooser/culture-chooser.js:115` under the same choosers directory |
| Construction/purchase/focus | `base-standard/ui/production-chooser/production-chooser-helpers.js:710,866`; `production-chooser-operations.js:38` in the same directory |
| Exact building placement | `base-standard/ui/interface-modes/interface-mode-place-building.js:385` |
| Growth/specialists | `base-standard/ui/interface-modes/interface-mode-acquire-tile.js:303` |
| Resources | `base-standard/ui-next/screens/commerce/commerce-screen-model.js:801,937,1198,1375` |
| Policies/government/celebration | `base-standard/ui/policies/model-policies.js:400`; `government-chooser/government-chooser-model.js:95`; `celebration-chooser/panel-celebration-chooser.js:230` under `base-standard/ui/` |
| Attributes/promotions | `base-standard/ui/attribute-trees/model-attribute-trees.js:136`; `unit-promotion/panel-unit-promotion.js:700` under `base-standard/ui/` |
| Generic unit actions | `base-standard/ui/unit-actions/unit-actions.js:954,1039,1081,1185,1251` |
| Movement semantics | `base-standard/ui/world-input/world-input.js:412`; `base-standard/ui/interface-modes/interface-mode-move-to.js:90` |
| Specialized unit actions | `base-standard/ui/interface-modes/interface-mode-{commander-attack,reinforce-army,rebase,move-by-rail,wmd-strike}.js` |
| Trade | `base-standard/ui/trade-route-chooser/trade-route-chooser.js:469` |
| Religion | `base-standard/ui/panel-belief-picker/panel-belief-picker.js:686,722`; `pantheon-chooser/screen-pantheon-chooser.js:180` under `base-standard/ui/` |
| Great Works | `base-standard/ui/great-works/model-great-works.js:278` |
| Diplomacy | `base-standard/ui/diplomacy-actions/screen-diplomacy-target-select.js:322`; `diplomacy/diplomacy-manager.js:780`; `diplomacy-peace-deal/panel-diplomacy-peace-deal.js:1244,1296` under `base-standard/ui/` |
| City-state bonus | `base-standard/ui/city-state-bonus-chooser/screen-city-state-bonus-chooser.js:126` |
| Narrative choices | `base-standard/ui/narrative-event/screen-narrative-event.js:317` |
| Turn gating/submission | `base-standard/ui/action/panel-action.js:684,750` |
| Transition completion | `base-standard/ui-next/screens/age-transition/age-transition-screen.js:54` |
| Civilization/Memento setters | `core/ui-next/screens/create-game/civ-select-model.js:19,360`; `memento-select-model.js:29,76` in the same directory |
| Advanced-start actions | `base-standard/ui/advanced-start/model-advanced-start.js:495,528,620,689` |
| Debug-only mutations | `base-standard/ui/tuner-input/tuner-input.js:31,146` |

Repository context: [current coverage audit](civ7-coverage-audit.md), [query dispatch](../civ7/queries.py), [connection](../civ7/connection.py), [MCP server](../sidkick/server.py), and [registration/connection tests](../tests/test_server.py).

## Verification record

- Live read-only presence diagnostic: all five `canStart`/`sendRequest` pairs and the three turn/blocker interfaces listed above were present at turn 58. No request functions were invoked.
- Existing offline registration/adapter tests: `civ7/.venv/bin/python -B -m unittest discover -s tests -p test_server.py` — **11 tests passed**. These check current read-only registrations and adapter behavior, not write execution.
- Full Python/Node regression suites and live write tests were not run for this documentation-only investigation.
- No gameplay, setup, UI selection, save/load, profile mutation, service restart or remote configuration change was performed. The only intended repository change is this unstaged report.
