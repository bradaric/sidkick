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
| 2 | Mandatory choices | Government, celebrations, tradition/crisis slots, policy swaps, narrative/crisis responses and blocking pickers | Picker/review/agenda/card-group, zero-cost non-trial narrative and cooperative project responses implemented; paid/trial/hostile/deal responses pending |
| 3 | Everyday unit control | Skip/sleep/wake/fortify/heal, promotions/upgrades, longer paths, shore transitions, peaceful foreign travel/exploration | Basic orders, promotions, capped upgrades and adjacent shores implemented; extended travel pending |
| 4 | Guarded turn completion | Exact one-turn submission, blocker handling and next-local-turn readback; stop on unsupported blockers | Implemented; 59 → 60 verified, 60 → 62 anomaly unresolved; further turns deferred by user |
| 5 | Advanced construction/resources | Queue edits, Wonders, repairs, overbuilding, unique improvements, unassignment/swaps/factory rules | Pending |
| 6 | Civilian/cultural actions | Found/resettle, Merchant travel/roads, archaeology, religion/beliefs/spread, Great People, Great Work swaps/archive | Pending |
| 7 | Fuller diplomacy | Responses/support/cancellation, independent befriending, city-state bonuses/levies, secondary targets and deals | Incoming cooperative response/support implemented; other items pending |
| 8 | Military logistics | Commander movement, packing/unpacking/formations, reinforcement, rail/rebase/transport | Bounded commander/packed-army movement, pack-all/unpack, individual land join/leave and reinforcement assignment implemented; rail/rebase/transport pending |
| 9 | Combat/hostile actions | Attacks/captures/pillage/raids, war/peace, espionage, each separately validated | Single-unit melee/ranged, commander Focus Fire/coordinated melee and native-gated Overrun implemented; positive Overrun live test blocked |
| 10 | Campaign boundaries | Age-transition civilization/legacy/Dedication and carry-over; post-victory continuation for tests | One More Turn tested through UI only; reusable boundary actions pending |

Save/load recovery and WMD actions are separately scoped optional extensions.
Not every native/DLC action ID is confirmed usable in the current ruleset.

### Current user override, 2026-11-06

Defer turn advancement until further instruction. Use the existing Franklin war
and available units to extend unit/army/combat coverage first, explicitly including
Katyusha ranged fire. Continue focused tested batches: native unit firing, bounded
commander/packed-army movement and broader hostile-target handling as supported.
Private readiness setup is permitted by the existing Playground agreement but
must not be confused with normal turn refresh or normal eligibility. User manually
confirmed war-screen Continue preserved T62, both Landships and Cuirassier87/100.
New checkpoint `Sidkick_Playground_BeforeArmyCombat_T62_1793956687710` saved with
  RESULT_OK and no overwrite; previous morning/pre-war checkpoints remain intact.
- Katyusha2621473 at `(13,17)` fired its normal native ranged operation at visible
  Franklin Cuirassier2687012 at `(15,19)`. Movement was privately restored; no attack
  point was granted. The original two-second verifier timed out with no effect yet
  visible, and the call was never retried. Later read-only evidence proved attacks
  1→0 and target damage0→18. Exact captured-state verifier independently returned
  attackObserved=true. Fix: combat alone gets bounded 15-second read-only polling;
  other generic actions retain two seconds. Delayed-read regression failed before
  the fix; 158 Python + 312 Node tests passed. Longer-window positive submission
  still needs a distinct target/attacker case; this shot was not resubmitted.
- Combat-window fix committed as `8b15846`.
- Commander/packed-army current-turn travel: max_steps1–8, every native path edge
  reachable/visible/empty/own-unowned/same-terrain/noncombat, no future-turn queue.
  Exact commander destination and packed IDs verified. 158 Python + 315 Node tests.
  Commander65536 moved empty `(28,30) → (28,29) → (29,29)` and returned via two
  edges. Typed pack collected Rifleman3080232; typed two-edge carriage to `(29,29)`
  verified `[3080232]` unchanged and independent logistics confirmed. Private
  movement restoration manufactured readiness; no turn advanced. Army remains
  packed there, with reinforcement3932172 still assigned (arrival untested).
- Bounded commander movement committed as `a6c2462`.
- Focus Fire: typed fixed command, actual UNIT_CLASS_RANGED tags, captured deployed
  ready radius participants and exact native target permission. No district/stack/
  civilian primary targets or enemy-territory attacks. Participant attack consumption
  plus visible primary effect required; commander movement loss alone is not firing.
  Native splash/secondary effects explicitly excluded from complete verification.
  161 Python + 320 Node tests; 57 write-mode tools including34 actions, default23.
- Setup commander3997707 purchased normally in Ur for1200; further Ur purchases
  correctly rejected (one purchase per turn). Katyusha4063242 purchased normally in
  Chichen Itza for990. New commander positioned `(15,17)` and Katyusha `(16,17)`;
  all moves checked, private movement restoration only, no extra attack points.
  Initial native-permitted Focus Fire with siege-only Katyusha spent commander
  movement but did not fire, returned unknown after15s. Never blindly repeated.
  Authoritative source tags show Katyusha=UNIT_CLASS_SIEGE, not UNIT_CLASS_RANGED;
  Focus Fire text explicitly requires Ranged. Eligibility regression catches this.
- Existing Field Gun2818084 moved from `(26,12)` to `(14,17)` via checked land/shore
  steps with restored movement; failed all-land routes were not bypassed. Distinct
  actual Ranged-class Focus Fire case verified attack1→0 and Cuirassier2687012
  damage18→38 in0.502s. Direct new Katyusha shot then verified attack1→0 and damage
  38→57 in2.588s, positively exercising the longer combat window. Independent read:
  both attacks exhausted, enemyHP43. Multi-participant firing fixture-only so far.
  Gold4731.33984375. Still T62, no turn advanced, original Merchant untouched.
- Ordinary heal-order probe on combat-damaged Cuirassier1245202 returned unknown:
  native state is HOLD with one exact REST_UNTIL_HEALED operation queued andHP87.
  Existing verifier only accepts HEAL/OPERATION activity; this is a concrete queued-
  order recognition bug to correct separately, not proof of restored health.
- Focus Fire batch committed as `3722d44`.
- Queued-heal correction: actual HOLD + exact REST_UNTIL_HEALED + positive queue
  recognized both by no-op detection and readback; other HOLD/empty/different-op
  cases remain negative. Original Cuirassier1245202 submission independently
  confirmed orderActive/healingQueued; corrected handler returned already_active
  without any second command. HP remains87, not restored. Reproducing regression
  failed before the fix; 161 Python + 321 Node tests pass. Still T62, no advance.
- End-of-drill save `Sidkick_Playground_AfterArmyCombat_T62_1793960375680`
  confirmed RESULT_OK, no overwrite. Earlier reviewed/pre-war checkpoints remain.

## Individual membership, coordinated melee and Overrun request

User requested completion of individual join/leave, coordinated melee and Overrun,
then a remaining-task inventory. Existing Playground scope applies; no turn advance.
- Checkpoint `Sidkick_Playground_BeforeMembershipMeleeOverrun_T62_1793961086467`
  confirmed RESULT_OK, no overwrite, previous checkpoints preserved.
- Individual join/leave: explicit unit and commander identities; land only, adjacent
  visible own/unowned native-offered destinations, no implicit transfer, no queued/
  reinforcing source, exact command checks. Full own army inventory must match the
  precise selected-unit membership delta; all other memberships preserved. Targeted
  logistics exposes addToArmy/removeFromArmy options with exact selected checks.
- Native Katyusha4063242 joined commander3997707 (`[] → [4063242]`), then left to
  `(16,17)` (`[4063242] → []`), both verified. Independent inventory in readback
  preserved Rifleman3080232 in army65536 throughout. Movement privately restored
  for join/leave eligibility; no attack points granted or turn advanced.
- 164 Python + 325 Node tests pass. Default23 tools unchanged; write mode59 tools,
  including36 actions. Naval/air membership and greater-than-adjacent joining remain
  unsupported. Original Merchant untouched.
- Individual membership batch committed as `fc34531`.
- Coordinated melee: actual Infantry/Cavalry roles, current native radius, captured
  ready deployed participants, explicit adjacent-only melee eligibility and native
  offered/selected command checks. Reuses fixed army_attack.js with ranged/melee
  modes only. Readout exposes separate coordinated-melee permission. Same visible
  single hostile own/unowned land-field target restrictions, no travel/cities/war.
- Landship3801103 positioned `(12,17) → (13,18) → (14,18) → (15,18)` through normal
  typed movement, readiness privately restored. Visible defender Cuirassier2687012
  privately restored via native Health.restoreUnitHealth (damage57→0) to preserve
  separate melee/Overrun cases; this is synthetic target-health setup, not healing
  through turns. Commander3997707 coordinated melee then verified Landship attack
  1→0 and defender damage0→45. Independent read attackerHP79, defenderHP55. One
  participant live; multiple participants fixture-only. No extra attack points or
  turn advancement. 167 Python + 327 Node tests; 60 tools including37 actions in
  write mode, default23 unchanged.
- Coordinated-melee batch committed as `da44e19`.
- Overrun: fixed native UNITCOMMAND_ARMY_OVERRUN command, explicit
  adjacent visible hostile land combat target, verified packed combat members,
  exact native offered/selected permission. No guessed odds/strength threshold,
  civilian/stack/district/foreign-territory targets or automatic unpacking. Verifier
  requires still-visible target departure, commander arrival and movement spend,
  with exact preserved packed membership; independent kill statistics stay unknown.
- Positive Overrun execution remains fixture-only. Live native gate rejected the
  post-melee55HP defender as Insufficient Strength Difference. Private native
  Health.damageUnit(54) reduced that already-visible defender to1HP as synthetic
  eligibility setup; the native gate still rejected. A full four-unit packed army
  was then assembled through typed individual joins, preserving all other armies:
  Landship3801103, Field Gun2818084, Katyushas4063242/2621473 in commander3997707
  at `(15,18)`. Native Overrun still rejected, including through actual MCP. No
  Overrun request was submitted to the engine and no native gate was bypassed.
- A debug-restored post-attack packed return move `(15,18) → (15,17)` returned
  unknown and remained queued. Read-only inspection found no arrival; the exact
  test order was explicitly cancelled and queue0 verified, never resubmitted.
  Cause/natural-turn readiness remain unverified, not a confirmed normal-use bug.
- 170 Python + 331 Node tests pass; default23 read-only tools, write mode61 tools
  including38 actions. Still T62, no turn advanced, Gold4731.33984375 unchanged.
  Original Merchant untouched; earlier checkpoints remain preserved.
- Final native save `Sidkick_Playground_AfterMembershipMeleeOverrun_T62_1793962725991`
  confirmed RESULT_OK, no overwrite. Readback: T62 active/sent=false, front commander
  at `(15,18)` with all four packed members and queue0, debug test defenderHP1,
  Gold4731.33984375, original Merchant `(18,20)`/HP100 unchanged.

## Remaining work after these requested batches (2026-11-06)

Implementation exists for individual land join/leave, adjacent coordinated land
melee and native-gated packed-army Overrun. Join/leave and coordinated melee have
positive live coverage under labelled movement/target-health prerequisites;
Overrun does not yet have positive live coverage. Do not conflate those statuses.

| Area | Remaining implementation / verification |
|---|---|
| Immediate military verification | Obtain a genuinely native-eligible positive Overrun case; simultaneous multi-participant Focus Fire/coordinated melee; reinforcement arrival; HP recovery through turns; post-attack packed movement with normal readiness. No turn advancement until user lifts deferral. |
| More commander abilities | Second Wind implemented/live-verified with debug-earned Valor; capped upgrade-all and direct/special commander attacks pending. Force March has UI text but no installed command definition, not exposed. |
| Military transport and travel | Individual naval combat join/leave live-verified; city-only deployed-aircraft rebase implemented, positive live case pending. Air membership, other fleet/squadron commands, army naval transport, rail, longer ordinary-unit paths, safe foreign/fog travel and packed-commander shore crossings pending. |
| Broader warfare | Separate ranged-only enemy-field action implemented (positive live case pending). City/district attacks, enemy-field melee, occupation/capture, pillage/coastal raids, naval/air strikes and complete splash/secondary accounting still pending. Other attacks retain own/unowned field boundaries. |
| Diplomacy | War/peace, deals and secondary-target execution, project cancellation/hostile responses/espionage, independent befriending, city-state bonus selection/levying. Cooperative starts/support and incoming cooperative responses exist; some response variants still lack positive live tests. |
| Civilian/cultural/religious actions | Found/resettle, Merchant roads, archaeology excavation/research, religion/pantheon/beliefs/spread, Great People, Great Work swaps/archive. Direct Merchant routes and non-swap Great Work relocation already exist. |
| Construction/resources | Wonders, repairs/overbuilding/unique improvements, queue cancellation/reordering, resource unassignment/swaps and advanced factory workflows. Existing production append and capped purchases remain bounded. |
| Choices and verification gaps | Positive fixed typed celebration and government choices, crisis-card/healing-through-turn cases, linked/crisis narratives, paid/trial choices, cooperative accept/reject variants; reusable informational/cinematic review actions. No debug prerequisite is evidence of naturally earned eligibility. |
| Campaign progression | Revisit historical60→62 anomaly when permitted; verify subsequent single-turn boundaries, repeat unattended progression and blocker handling; reusable post-victory and Age-transition civilization/legacy/Dedication/carry-over actions. |
| Separately scoped optional work | Typed save/load recovery and WMD actions. Private native test saves are not reusable action-tool coverage. |

## Continued commander abilities, 2026-11-06

User authorized continuing without further input within Playground scope. Agreed
priorities: commander abilities, then broader combat; turn advancement still deferred.
- Native checkpoint `Sidkick_Playground_BeforeCommanderAbilities_T62_1793964366039`
  confirmed RESULT_OK, no overwrite; earlier checkpoints preserved.
- Force March: UI callbacks and localization exist, but GameInfo.UnitCommands has
  no UNITCOMMAND_FORCE_MARCH definition and no corresponding installed ability.
  Do not register a speculative action from localization alone.
- Second Wind: native picker uses the commander ID and exact recipient `{X,Y}`.
  Added grant_civ7_second_wind with strict commander/recipient/turn identities,
  single visible own/unowned land-combat recipient tile, no queues/reinforcement,
  complete known source membership and native offered/selected checks. Readback
  requires exactly +2 movement/+1 attack with stable health/location and source
  packed membership. Selected commander logistics lists checked recipient options.
- Synthetic ability prerequisite: +200 debug XP to front commander3997707, then
  native checked Initiative → Rout → Shock Tactics → Advancement (points4→0),
  yielding one commendation; checked Valor consumed commendation1→0 and granted
  Second Wind. This is not naturally earned combat XP.
- Field Gun2818084 individually left the commander to `(14,18)` through the typed
  leave action. Actual MCP Second Wind verified movement1→3 and attacks0→1,
  stable health/location and packed members2621473/3801103/4063242. Still T62;
  no turns advanced or attack-point debug grants. Original Merchant preserved.
- 173 Python + 335 Node tests pass; default23 tools unchanged, write mode62 tools
  including39 actions. Ability cooldown/recharge through turns not tested.
- Second Wind batch committed as `2f784d1`.
- Army-wide upgrade remains pending: native UPGRADE_ARMY returns Success=false
  for all current commanders; no authoritative positive price/affected-unit quote
  was available. No speculative aggregate quote parser or inferred targets added.
- Separate ranged_attack_civ7_enemy_field tool reuses the fixed individual attack
  script with a strict ranged-only enemy_field mode. Requires tile owner exactly
  the met wartime target player, native MapCities non-district classification,
  owning city identity and a visible noncoincident centre, plus existing single
  visible combat target/native ranged checks. No melee entry/capture, districts
  (even undefended urban districts), city centres, civilian/stack/third-party
  targets, new war or hidden approach. Existing default attack boundaries unchanged.
- Positive enemy-field execution remains fixture-only. Actual MCP rejected the
  visible Heavy Artillery3407914 at `(15,20)` because it is on an urban district;
  no shot submitted. Other close targets were stacks. Private Units.create with
  Validate=true and a separate explicit debug Validate=false case on already-
  visible empty `(18,18)/(18,19)` both returned Success=false for both test units;
  no debug-created positive case or bypass is claimed. No map reveal performed.
- 176 Python + 336 Node tests pass; default23 tools, write mode63 tools including
  40 actions. Enemy-field primary-target verification uses existing attack spent/
  loss plus visible damage/departure, not kill/capture or complete splash proof.

## Air/naval logistics continuation, 2026-11-06

Continuing military logistics under the existing Playground authorization. Priorities:
air rebase and same-domain naval/air membership where native semantics are known.
Turn advancement remains deferred; original Merchant and reviewed saves preserved.
- Checkpoint `Sidkick_Playground_BeforeAirNavalLogistics_T62_1793965444454`
  confirmed RESULT_OK, no overwrite. Previous final Second Wind checkpoint
  `Sidkick_Playground_AfterSecondWindEnemyField_T62_1793965106016` also confirmed.
- No aircraft currently owned and no air purchases offered in Copan/Ur/Chichen Itza.
  Native Rebase handler uses exact aircraft `{X,Y}` with coordinate-free offered
  plots and selected permission. No speculative aircraft command was submitted.
- Added explicit join_civ7_fleet/leave_civ7_fleet wrappers over the existing exact
  membership scripts, using a fixed DOMAIN_SEA guard. Requires a Fleet Commander,
  packable naval combat ship, matching water locations and visible own/unowned
  commander/deployment tiles. Same adjacency, empty leave destination, native
  picker/selected permission and complete own army preservation checks as land
  membership; no civilians, land transport, mixed-domain or implicit transfers.
  Selected naval logistics exposes checked same-domain water join/leave options.
- Dreadnought3342357 joined Fleet Commander131073 at `(46,30)` from `(47,30)`,
  then left back to `(47,30)`; both typed actions verified. Full army inventory
  preserved Rifleman3080232 in commander65536 and front commander's three members
  2621473/3801103/4063242. Exact ship/commander movement privately restored as
  synthetic readiness; no turn advancement or new purchases.
- 176 Python + 338 Node tests pass. Default23 read-only tools; write mode65 tools,
  including42 actions. Air membership and full-fleet actions still pending.
- Fleet membership batch committed as `55a3d19`.
- Added rebase_civ7_aircraft: exact owned deployed unqueued nonreinforcing aircraft
  and exact owned target_city_id. Restricts destination to its currently visible
  owned centre and requires native coordinate-free REBASE offered plot and exact
  selected-target permission. All own army membership must be known and source
  unpacked. Captured identity, exact arrival, clear queue, stable HP and complete
  preserved own army membership are read back; no future-turn arrival claim.
- Initial rebase scope excludes commander/carrier/squadron transfers, packed or
  auto-packed aircraft, foreign bases and hidden destinations. Positive execution
  remains fixture-only: no aircraft owned/no air purchases offered in checked
  nearby cities. Actual MCP rejected a deliberately selected naval unit before
  any request; this is only a live type guard, not positive rebase coverage.
- 179 Python + 341 Node tests pass; default23 read-only tools unchanged, write
  mode66 tools including43 actions. No turns advanced or purchases made.

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
- Batch 5 committed as `f4d87c8`.
- Batch 6: 141 Python + 287 Node tests. Incoming cooperative accept/support/reject
  handler with native selected-response quote, explicit Influence cap, provenance
  and same-event verification; diplomacy readout includes native response options.
  War/demand/espionage/deal and different-response replacement are rejected.
  Live Jose Rizal Cultural Exchange 76: support quote 180, cap179 rejected, cap180
  verified response SUPPORT and exact Influence 564.82421875 → 384.82421875.
  Independent diplomacy read confirmed. Accept/reject fixture-only. Still T62;
  no further end-turn or One More Turn calls, anomaly remains unresolved.

## Renewed Playground implementation, 2026-11-06

User renewed authorization to cover as much remaining functionality as practical.
Continue focused, tested batches without routine checkpoints; report real gaps.
Priorities: correct celebration readiness; add promotions/upgrades and military
logistics/control; make informational/campaign prompts reusable; investigate
turn advancement before relying on unattended progression. Preserve the reviewed
morning state in a separate native save before further game mutations.

Morning inspection/actions before this implementation batch:
- User confirmed all five Roskilde checks (city, Fishing Quay, Harbor queue,
  improved/assigned Pearls, two Scouts).
- Normal One More Turn button enabled extended mode and closed the victory
  screen at T62 without advancing. Normal Lobster Volcano Continue dismissed its
  cinematic, also without advancing.
- Native UI acknowledged espionage/advisor reports. Genuine celebration prompt
  existed with active celebration and canChoose=false; normal offered Science
  confirmation cleared it, completed Combustion II and created an ordinary slot.
  This proves a readiness bug in both typed action and readout, not successful
  typed celebration coverage. Fix from this evidence; never replace native getters.
- Mass Production II selected, Harbor queued in Roskilde, Pearls 1063 assigned
  to Copan and Sugar 1885 to Kyiv. Typed resource review positively verified.
  New ordinary slot filled with Levies after explicit Divine Right removal,
  as requested by user for military testing. Other cards unchanged.
- Final morning preflight: T62, extended=true, native blocker NONE, no ready
  units/population/narrative decisions or open review panels. Informational
  notifications remain. No turn advanced in the morning action sequence.
- Celebration readiness fixed in action, targeted verifier and research readout:
  a live owned non-dismissed/non-expired CHOOSE_GOLDEN_AGE notification is pending
  even when active/default celebration exists and canChoose=false. Native offered
  choice and exact permission checks remain mandatory. Regression reproduced the
  observed bug; 141 Python + 289 Node tests passed. Current post-choice native
  no-op verified without awarding the bonus again. Positive fixed typed submission
  still needs another genuine pending case.
- Reviewed morning state preserved in separate save
  `Sidkick_Playground_ReviewedMorning_T62_1793948595702`, RESULT_OK, no overwrite.
- Promotions: exact native class/discipline/choice checks, one PROMOTE command,
  captured-unit acquired-promotion readback and exact discipline IDs in unit
  readout. 144 Python + 293 Node tests pass. No naturally eligible promotion was
  available. Authorized debug Units.changeExperience granted 41 XP to commander
  65536 (level 2 → 3, point 0 → 1); normal typed Initiative promotion verified
  acquired and point 1 → 0. Synthetic eligibility, not naturally earned combat XP.
- Upgrade discovery: all ordinary units initially had zero movement. Debug
  Units.restoreMovement restored movement for commander 65536 and Cuirassier
  1310739. The latter now offers Landship, native English quote 200 Gold, with
  target definition index 26. No upgrade submitted yet. A debug create probe for
  Line Infantry produced no observed new unit and is not counted as setup.
- Promotion batch committed as `a892338`; celebration correction as `550c30f`.
- Capped unit upgrades: 147 Python + 299 Node tests. Exact English native upgrade
  quote only, explicit target/cap, fresh native permission and loaded upgrade link.
  Native replacement-ID behavior was observed and regression-tested: old unit
  disappears, exactly one new same-tile target excluding baseline inventory, exact
  Gold spend; unknown/ambiguous results never resubmitted. Cuirassier 1310739 →
  Landship 3801103 spent 200, initial unknown resolved read-only, no repeat. A
  distinct Cuirassier 1376276 → Landship 3866637 then verified normally, 200 Gold.
  Cap199 rejected. Both used debug-restored movement (synthetic readiness); no turn
  advancement. Gold now 8006.33984375. Reviewed morning checkpoint remains preserved.
- Upgrades committed as `7cb608e`.
- Commander batch: 150 Python + 304 Node tests. Native pack-all-nearby with known
  owner-qualified commander/army membership; owned-visible native-offered unpack
  plots and exact selected-plot checks. No raw/per-unit pack dispatcher. Targeted
  logistics readout exposes both actions' eligibility. Native commander 65536
  packed Rifleman 3080232, then unpacked at `(28,30)`; complete membership/deployment
  verified independently. Movement was debug-restored (synthetic readiness).
  Initiative preserved one native post-unpack movement point, and ordinary typed
  land move `(28,30) → (27,30)` verified. No turn advanced; still T62.
- Commander batch committed as `216c182`.
- Reinforcement: 153 Python + 307 Node tests. Native offered/selected plot to an
  exact owned commander/army, no packed/queued/redirected source, assignment-only
  readback and native ETA, no arrival promise. Normal purchased Copan Rifleman
  3932172 cost1085 Gold; native reinforcement blocked at zero movement. Private
  debug restored movement; typed reinforcement then verified army65536 assignment,
  native ETA9; independent logistics matched. Synthetic readiness, arrival untested.
  Gold6921.33984375, still T62, no turn advance. Original Merchant remains untouched.
- Reinforcement batch committed as `a91e085`.
- Field combat: 156 Python + 311 Node tests. Explicit target owner/instance/tile,
  existing-war only, single visible combat-formation defender on owned/unowned
  tiles, native adjacent melee / ranged picker checks. No districts, enemy-territory
  attacks, civilians, stacks, commanders, air, war declaration or confirmation bypass.
  Captured attack-count plus observed visible target damage/departure proves the
  attack, not predicted damage or a kill. No hidden post-combat target reads.
- Pre-war checkpoint `Sidkick_Playground_BeforeCombat_T62_1793950860208` confirmed
  RESULT_OK, no overwrite. Sandbox native declaration made player4/Franklin hostile;
  not typed war support. Debug create/reposition probes had no observed effect.
  Field Cannon983054 positioned through ordinary typed movement to `(18,17)` with
  debug-restored movement between steps. One step `(21,16) → (20,17)` timed out
  unknown, later arrival confirmed read-only, never resubmitted. Typed ranged
  attack on Field Gun4063280 at `(17,18)` verified damage0→30 and attacks1→0.
  Cuirassier1245202 positioned `(15,15) → (16,16) → (16,17)` with restored movement;
  typed melee on the same defender verified attack consumption and target departure.
  Independent read: CuirassierHP87, no defender on target tile. These are real native
  attacks under synthetic war/readiness, not naturally occurring campaign coverage.
  Still T62; no turn advancement. Reviewed morning save and original Merchant preserved.
- Field combat committed as `3973c4c`.
- Adjacent shore steps: existing movement tool now allows direct native-offered
  land-unit embark/disembark, same noncombat/path/visibility/ownership checks and
  actual embarkation-state readback. Sea units cannot leave water. 157 Python +
  312 Node tests. Scout3670032 normally moved `(24,5) → (25,5)`, embarked at `(25,4)`
  (false→true), then disembarked back to `(25,5)` (true→false), each verified.
  Prerequisite movement was debug-restored. Native-detour request `(24,4)` correctly
  rejected without queueing. No turn advanced; no new tools.
- Turn-boundary investigation: source confirms one Sidkick sendTurnComplete and
  no transport resubmission. Native panel can auto-submit with isAutoEndTurn;
  victory UI's next-player button is another native submission path, not proof
  either caused the historical 60→62 event. Four concurrent read-only turn/position
  pairs returned correct shapes; no transport mix-up reproduced. Cause unresolved,
  not silently repaired or retried; no further turn advancement in this batch.
