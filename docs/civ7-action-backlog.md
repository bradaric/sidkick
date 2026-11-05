# Civ VII action implementation backlog

Agreed priorities, 2026-11-05. Playground Rules apply to Sidkick implementation
and the designated disposable local single-player game. They do not authorize
host/configuration changes, credentials, infrastructure, online/multiplayer
actions, publishing, pushes or destructive Git operations.

## Working agreement

- Implement and verify focused batches directly in this session; no subagents.
- Keep writes stdio-only and opt-in, typed, owner/phase/target checked, submitted
  once and verified through bounded native readback. Never retry uncertain writes.
- Continue without routine approval/manual-inspection pauses. Preserve unrelated
  saves and checkpoints; use separate test saves when save support is available.
- Debug-created eligibility is permitted, but label it explicitly and still use
  the normal typed handler/native operation for the action being tested. Never
  count a forced effect as successful normal execution.
- Run focused red/green tests, regressions and diff checks. Commit completed
  batches separately under the user's standing instruction. No pushes.
- Report actual results and blockers, not promises about completion time.

## Existing baseline

At `a410139`: 13 opt-in writes, 23 default read-only tools; 118 Python and 253
Node tests passed. Live successes: research/civic selections, Great Work move,
cooperative diplomacy/incorporation starts, unit/building purchases, queue append,
direct Merchant route, population placement, resource assignment and adjacent
embarked movement. Positive ordinary-policy toggles and attribute purchases still
need a suitable live case. Land-only/naval movement currently has fixture coverage.

## Priority order

| # | Capability family | Remaining work | Status |
|---|---|---|---|
| 1 | Settlement management | Town focus, town-to-city upgrades, specialists | Implemented; live-verified (synthetic prerequisites for upgrade/specialist) |
| 2 | Mandatory choices | Government, celebrations, tradition/crisis slots, policy swaps, narrative/crisis responses and blocking pickers | Picker/review/agenda/card-group and zero-cost non-trial narrative handlers implemented; paid/trial/project/deal responses pending |
| 3 | Everyday unit control | Skip/sleep/wake/fortify/heal, promotions/upgrades, longer paths, shore transitions, peaceful foreign travel/exploration | Basic orders implemented; travel/promotions/upgrades pending |
| 4 | Guarded turn completion | Exact one-turn submission, blocker handling and next-local-turn readback; stop on unsupported blockers | Implemented; native 59 → 60 verified |
| 5 | Advanced construction/resources | Queue edits, Wonders, repairs, overbuilding, unique improvements, unassignment/swaps/factory rules | Pending |
| 6 | Civilian/cultural actions | Found/resettle, Merchant travel/roads, archaeology, religion/beliefs/spread, Great People, Great Work swaps/archive | Pending |
| 7 | Fuller diplomacy | Responses/support/cancellation, independent befriending, city-state bonuses/levies, secondary targets and deals | Pending |
| 8 | Military logistics | Commander movement, packing/unpacking/formations, reinforcement, rail/rebase/transport | Pending |
| 9 | Combat/hostile actions | Attacks/captures/pillage/raids, war/peace, espionage, each separately validated | Pending |
| 10 | Campaign boundaries | Age-transition civilization/legacy/Dedication and carry-over; post-victory continuation for tests | Pending |

Save/load recovery and WMD actions are separately scoped optional extensions.
Not every native/DLC action ID is confirmed usable in the current ruleset.

## Batch 1: settlement management

Use the existing Python action lock/verifier and fixed bundled scripts; do not
introduce an arbitrary operation dispatcher or change persistent client config.

- [x] Add failing Node fixtures for focus selection, native town-upgrade Gold
  quotes/caps and specialist placement (including pending population and capacity).
- [x] Add strict Python/MCP tests and three opt-in typed wrappers/registrations.
- [x] Implement native checks/submission and targeted readback in
  `civ7/settlement_management.js` and `civ7/settlement_management_state.js`.
- [x] Run `civ7/.venv/bin/python -B -m unittest discover -s tests -p 'test_*.py'`
  and `node --test --test-reporter=tap tests/test_*.cjs`; inspect the diff.
- [x] Live-test normal available focus changes. Native upgrade initially lacked
  Gold and no city has ready population: obtain separate test-save evidence and
  manufacture those prerequisites if needed, distinguishing synthetic setup
  from actual typed native upgrade/specialist execution.
- [x] Record observations and prepare the verified batch for commit.

## Progress log

- Playground start: turn 59, Modern, player 0; Gold 1054.27734375. Town focus
  choices are available; town upgrades quote 2900–5000 Gold. No settlement has
  ready pending population. Unit orders remain an end-turn blocker.
- Separate baseline save `Sidkick_Playground_Baseline_T59_1793918023366`
  confirmed `RESULT_OK`, no overwrite. No unrelated save/checkpoint was changed.
- Batch 1: 122 Python + 259 Node regressions passed. Native Roskilde Mining →
  Growing → Mining round-trip verified; no-op and real insufficient-Gold rejection
  verified. Debug setup granted 10000 Gold and one rural population to Copan;
  this was synthetic eligibility, clearly separated from execution. Native typed
  Roskilde upgrade spent 3400 Gold and created a city with one pending placement.
  Native typed Copan specialist `(25,11)` changed workers 0 → 1, pending 1 → 0.
  Independent readers confirmed both. No turn advancement in this batch.
- Batch 1 committed as `78ac464`.
- Batch 2: basic orders and guarded turn completion. 128 Python + 265 Node tests.
  Typed wake/sleep/cancel/skip/fortify/alert live-verified; heal fixture-only.
  Stable skip activity is HOLD without a queued operation; first unknown outcome
  was resolved by read-only evidence, not repeated. Existing queues need explicit
  cancel/wake. Real population/production/resource-review blockers were respected.
  Roskilde Pearls growth `(26,8)` and Scout queue used existing typed actions.
  Resource review was a private native UI contract probe (CONSIDER_ASSIGN_RESOURCE),
  not typed support or a forced blocker bypass. First native end request remained
  on turn 59 with two newly ready ships; returned unknown, no automatic retry.
  After fresh readback and explicit ship skips, native typed turn completion
  verified 59 → 60. Current blocker: DIPLOMATIC_RESPOSE_REQUIRED (native spelling).

## Mandatory-choice progress

- Batch 2 committed as `ee68148`.
- Batch 3: 132 Python + 272 Node tests. Three native picker/review handlers plus
  exact agenda-popup acknowledgement. Turn-60 "diplomatic response" was an agenda
  message, not an incoming proposal; exact notification 288 was acknowledged and
  verified through MCP. No pending celebration was correctly rejected; current
  government and resource review were no-ops. First government preflight found
  GameInfo collections lack `some` (no write submitted); native-style fixture
  reproduced it and supported `filter` fixed it.
- Separate save `Sidkick_Playground_BeforeChoices_T60_1793919586400` confirmed
  RESULT_OK, no overwrite. Private debug `Happiness.startGoldenAge()` with no
  arguments produced no observed pending/active celebration; not counted as
  synthetic eligibility or successful handler coverage. Positive government,
  celebration and typed resource review remain live-test gaps, with fixture
  coverage. Do not manufacture eligibility by replacing UI getters.
- Next: exact tradition/crisis slot placement and policy swaps; narrative/crisis
  responses; genuine project/deal responses. Stop at unsupported blockers instead
  of forcing turns.
- Batch 3 committed as `c66d00b`.
- Batch 4: 135 Python + 277 Node tests. Exact card group activation/removal with
  all-group inventory verification; no implicit migration, bulk or atomic swaps.
  Live Civil Engineering tradition-slot activation/removal, Pet Kot placement,
  original Living Standards ordinary off/on round trip and typed policy-review
  acknowledgement all verified. Ordinary-policy positive live gap is closed.
  Crisis-card positive live coverage is unavailable (Modern crisis slots = 0).
- Naturally pending St. Petersburg specialist `(18,9)` verified, workers 0 → 1
  and pending population 1 → 0; differs from Copan debug prerequisite case.
  Globalism selected through existing typed civic handler. Still turn 60;
  remaining blocker UNITS. Campaign retains previously documented debug changes.
- Batch 4 committed as `11df5d2`.
- Batch 5: 138 Python + 281 Node tests. Exact pending non-trial narrative choices,
  zero definition cost only; native offered/requisite links, CLOSE fallback and
  native operation permission checked. Live normal ARCHAEOLOGY_14A CLOSE at Thera
  consumed instance 223/type35; independent pending read confirmed. Artifact
  reward was displayed but not independently measured. Linked/crisis choice
  positives remain fixture-only. Nonpending instance 237 was correctly rejected.
- Separate before-narrative save `Sidkick_Playground_BeforeNarrative_T60_1793920224440`
  confirmed RESULT_OK. Debug onRequirementsMet(componentId) had no observed effect
  on instance 237 or pending queue; not counted as synthetic eligibility.
- One typed turn-completion submission after explicit T60 unit skips observed T62,
  not T61; conservatively unknown, no automatic retry. Fresh state is active T62.
  Extra advancement cause unresolved; auto-end-turn is off. No further end-turn
  requests until this boundary is understood. Hatshepsut's cultural victory is
  reported completed; no One More Turn/EXTEND_GAME has been submitted. Celebration
  reminder existed but native canChoose is false and celebration is active;
  earlier debug probe's eventual influence is uncertain, no selection coverage
  claimed. Real Jose Rizal diplomatic proposal is now available to inspect.
