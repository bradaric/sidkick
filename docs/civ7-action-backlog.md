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

### Group 1 completion request

User requested trying to finish all work possible with the current save and
supported debug setup before expanding turn/state-dependent Group 2. No turns.
Work through: ordinary-unit rail; direct commander attacks; broader land combat;
stronger combat observation; military movement/transport; construction/resources;
diplomacy/choices; civilian/cultural actions; regression/documentation hardening.
Implementation/fixtures and positive native execution are separate statuses.
When a live prerequisite cannot be manufactured through supported setup, record
the exact prerequisite in Group 2 rather than bypassing native eligibility or
claiming Group 1 complete. Force March remains unavailable in this build.

- Ordinary-unit rail completed: rail_civ7_unit uses exact native offered/selected
  MOVE_BY_RAIL, known unpacked/nonreinforcing unqueued unembarked land source,
  visible owned land endpoints and empty target; no walking fallback or inferred
  connectivity. Actual MCP Rifleman2490373 `(26,11) → (19,11)` verified identity,
  destination and queue0. Movement setup was synthetic. Separate commander4128776
  moved to `(25,11)` and the Rifleman individually left onto the station before
  rail; all other army memberships preserved. Gold2131.33984375 unchanged; T62.
- Group 1 checkpoint `Sidkick_Playground_BeforeGroupOne_T62_1793974033209`
  confirmed RESULT_OK/no overwrite. 187 Python + 352 Node tests pass; default23
  read-only tools, write mode70 tools including47 actions.
- Ordinary rail committed as `2dd63c3`.
- Resource unassignment and atomic swap implemented. Unassign requires exact owned
  resource/off-map identity and current source settlement, native Deactivate and
  unlocked assignment; no-op only when already unassigned. Native SWAP_RESOURCES
  uses exact two identities, no sequential fallback, known full owned assignment
  ledger and native permission; readback proves both changes and all unrelated
  assignments preserved. Off-map/map same-number identities fixture-tested.
- Actual MCP Pearls618 unassigned from Roskilde and reassigned back, both verified.
  Pair1063/618 swap natively rejected with no request; bounded read-only probe of
 18 other assigned-resource pairs with618 also found no native permission. Positive
  atomic swap execution is a Group 2 eligible-pair gap, not bypassed or claimed.
  Roskilde's original slot restored; Gold/T62 unchanged.
- 191 Python + 356 Node tests pass; default23 tools, write mode72 including49 actions.
- Resource mutation batch committed as `9c739fc`.
- Production queue cancellation/adjacent reordering completed. Fresh available-
  decisions production.queue/queueToken expose exact current entries. Typed edit
  requires the full opaque token plus exact indices; fixed native BUILD RemoveAt/
  Swap only, max64 entries, rejects stale tokens/confirmations. Full ordered queue
  readback preserves every untouched entry; no refund/progress-retention promise.
- Live MCP appended disposable Merchant/Settler orders behind Copan's existing
  Scout, swapped indices1/2 and cancelled only those two appended orders. Each
  action verified; final queue token exactly equals the original Scout queue.
  No turn, production progress reset, purchase or Gold change. 194 Python + 359
  Node tests pass; default23 tools, write mode73 including50 actions.
- Queue edit batch committed as `7026d21`.
- Direct commander Heroic Assault completed: exact fixed native COMMANDER_ATTACK,
  adjacent visible same-domain hostile combat unit on own/unowned non-district
  field, ready unembarked unqueued commander, known captured packed members and
  exact offered/selected native permission. Packed members need not be deployed,
  but they do not attack and must remain unchanged. Readback requires observed
  commander movement/attack spend and primary-target effect; not numeric ability
  charge accounting or kill/splash proof. Combat query now also checks selected
  commander-attack permission, not just the offered picker.
- Synthetic eligibility: +1000 test XP to3997707, checked native Steadfast → Bulwark
  → Defilade → Resolute and Duty commendation. Restored previously debug-weakened
  Cuirassier2687012 from1HP to100HP. Actual MCP Heroic Assault then verified damage
  0→40, source movement3→2 and attacks1→0, stable `(15,18)`/queue0 and packed
  2621473/3801103/4063242 unchanged. No attack/ability effect forced or turn advanced.
- 197 Python + 361 Node tests pass; default23 tools, write mode74 including51 actions.
- Heroic Assault committed as `a67b249`.
- Checked wartime field advance completed: explicit target_player, existing met
  war, ordinary ready unqueued unpacked/nonreinforcing land/sea combat unit,
  adjacent visible empty same-terrain non-district field owned by that exact enemy,
  direct reachable native noncombat path and MOVE_TO/NONE. No city/district entry,
  capture, shore change, third-party territory, war declaration or turn advance.
  Existing ordinary movement keeps its own/unowned boundary. Exact identity,
  location, unembarked state and queue0 are verified.
- Field Gun2818084 positioned by checked own/unowned steps `(14,18) → (14,17) →
  (15,17) → (16,16) → (17,16) → (17,17) → (18,18)`, restored movement between
  setup steps, then actual MCP advance to Franklin field `(18,19)` verified with
  normal native permission (movement2→1, attack1 retained). No additional attack
  points granted; native district-ranged permission toward `(18,21)` is now offered.
- 197 Python + 362 Node tests pass; default23 tools, write mode75 including52 actions.
- Wartime advance committed as `0a984d3`.
- Ranged defensible-district attack completed: exact visible met wartime district
  component/location, remaining HP, ready unpacked/nonreinforcing land ranged/siege
  attacker and native attackable picker/selected permission. Ranged only, no entry/
  capture. Native district can contain a hostile garrison; only primary district
  effect plus attack spend/loss is verified, not complete garrison/retaliation/splash.
  Combat-options now exposes exact hostile district owner/instance/component IDs.
- Actual MCP Field Gun2818084 at `(18,19)` attacked Franklin city-centre district
  196610 at `(18,21)`: attack1→0, district damage0→10. No district HP was forced.
  Original Merchant remains separate; no turn advanced.
- 200 Python + 364 Node tests pass; default23 tools, write mode76 including53 actions.
- District bombardment committed as `09d190d`.
- Native Tuner UI `CREATE_ELEMENT` works where prior private Units.create did not.
  All following cases are explicitly synthetic prerequisites, not natural production.
  Created own Field Gun4390956 `(18,18)` and Franklin Rifleman4653101 `(17,20)`;
  normal MCP enemy-field ranged attack verified attack1→0/damage0→21. Created
  Franklin Frigate4718629 `(31,14)`; existing Dreadnought3407900 normally fired
  MCP naval attack, attack1→0/damage0→31. Both previous positive-execution gaps closed.
- Created Biplane4456493, Squadron Commander4522030 and city Aerodrome Commanders
  4587567 St. Petersburg `(19,9)` / 4653104 Copan `(26,12)` through native Tuner.
  First normal aircraft rebase submitted once and returned unknown: actual native
  arrival stations aircraft off-map inside the destination Aerodrome, contradicting
  old on-map/unchanged-membership verification. Arrival independently read, never
  repeated. Fixed verifier captures exact city Aerodromes and expected source/
  destination member delta, preserves all other armies, accepts only deployed or
  captured city-Aerodrome source (not squadron/carrier). Distinct normal MCP return
  rebase St. Petersburg → Copan verified aircraft4456493 in4653104, source empty,
  health stable/queue0 and all other memberships preserved. Movement setup synthetic.
- Pre-Tuner checkpoint `Sidkick_Playground_GroupOneBeforeTunerCases_T62_1793976618146`
  confirmed RESULT_OK; no overwrite. No turns; Gold2131.33984375 unchanged.
  200 Python + 365 Node tests pass; tools unchanged at23/76 including53 actions.
- Aerodrome correction committed as `fbe5c44`.
- Constructible pillaging implemented: exact current tile occupied only by one
  ready land combat unit, known unpacked/nonreinforcing state, met wartime owner,
  visible owning centre elsewhere, fresh full constructible token from combat
  evidence and exact native offered/selected PILLAGE permission. Native chooses
  the building/improvement. Readback proves movement spent and visible new damage/
  departure; no exact yield/healing, route-destruction or capture claim.
- Synthetic Rifleman4718641 at `(16,21)` was correctly rejected because its owning
  city centre was fogged; no pillage submitted. Distinct synthetic Rifleman4784178
  at `(18,22)` normally pillaged existing Woodcutter3735608: movement2→0 and
  damaged=false→true, verified through MCP. No damage effect forced or healing
  claim. Gold2131.33984375/T62 unchanged; original Merchant remains untouched.
- Map Tuner IMPROVEMENT and City Tuner CONSTRUCTIBLE farm setup attempts at empty
  `(19,20)` produced no observed constructible and are not claimed successful.
  Native unit creation remains supported; do not assume building creation works.
- 202 Python + 369 Node tests pass; default23 tools, write mode77 including54 actions.
- Pillage batch committed as `fab62ec`.
- Multi-participant native verification completed under synthetic prerequisites.
  Created commander4849715 and guns4915252/4980789, checked repositioning into its
  real radius (commander `(14,17)`, guns `(14,18)`/`(15,17)`), restored movement
  after setup, restored visible Cuirassier2687012 to100HP. Normal MCP Focus Fire
  consumed both attacks1→0 and dealt47 damage, both guns100HP. Initial out-of-radius/
  range setup was rejected before submission, not bypassed.
- Distinct native coordinated melee: commander moved by checked step to `(14,16)`;
  synthetic own Riflemen5046326 `(13,16)` / 5111863 `(14,17)` and Franklin
  Rifleman4784138 `(13,17)`. MCP returned after first participant hit (28 damage),
  later readback confirmed both attacks1→0, total damage76, attackerHP77/87 and
  clear queues. Do not present the early primary-effect result as full completion.
- Combat readback now separately exposes each captured participant's presence,
  before/current attacks, consumption/loss, HP, location and queue, plus
  allCapturedParticipantsConsumed. Existing success remains primary-effect/at-least-
  one-consumer scoped; secondary attacks may finish later. Unknown negative attack
  counts no longer count as spent attacks. Fixture covers partial vs complete;
  exact read-only native verifier confirmed both complete live cases without retry.
- Overrun still natively unavailable: synthetic Tank5177400 joined65536 with its
  original Rifleman3080232 retained. Native picker reports Insufficient Strength
  Difference against synthetic Franklin Field Gun4915254 `(29,30)`; no Overrun
  submitted. Another Field Gun4849717 appeared at `(28,29)` rather than requested
  `(29,28)`: Tuner creation may relocate units, so absence at the requested plot
  is not proof of no effect. Warrior type is unavailable in this age's definitions.
  Original commander remains `(29,29)` with Rifleman + test Tank, reinforcement
  assignment retained. Native Tank leave offers only occupied origin/foreign tile;
  bounded adjacent-empty tool rejected, no removal submitted.
- 202 Python + 370 Node tests pass; tools unchanged23/77 including54 actions.
- Participant observation batch committed as `fa0ba2c`.
- Individual land/fleet deployment now permits the exact commander origin only
  when native offered/selected checks allow it and that tile contains precisely
  the selected commander, with no other deployed unit or ambiguous commander.
  Adjacent-empty alternatives retain their previous guards. Exact occupancy is
  rechecked before submission; logistics exposes the same bounded option. This is
  not arbitrary stacking, foreign entry or auto-unpack.
- Actual MCP Tank5177400 individually left65536 at origin `(29,29)`, verified
  deployed identity/location and complete army ledger. Original commander65536 is
  restored to just packed Rifleman3080232; reinforcement3932172 untouched. Naval
  origin variant is fixture-tested, not positively live-tested in this batch.
- 202 Python + 371 Node tests pass; tools unchanged23/77 including54 actions.
- Origin deployment committed as `455ba35`.
- City-Aerodrome air strikes implemented: ready exact stationed aircraft, captured
  visible owned city/base and full unique army ledger, one exact visible hostile
  land/sea combat target on own/unowned non-district field, existing met war and
  exact native AIR_ATTACK offered/selected permission. No standalone deployed,
  carrier/squadron, enemy-territory, air-to-air or district/nuclear strike. Verifies
  aircraft attack consumption/loss and primary-target damage/departure, source city/
  base identity and precisely preserved surviving membership (only lost attacker
  may depart). Full interception/retaliation/splash and kills remain unverified.
- Actual MCP synthetic Biplane4456493, stationed in Copan Aerodrome4653104, fired
  normally at synthetic Frigate4718629 `(31,14)`: attack1→0 and damage31→51 (20
  new damage), all source/other memberships preserved. Movement setup synthetic;
  no attack/damage effect forced. Combat-options now recognizes a captured city
  Aerodrome source without falsely calling the aircraft deployed; unknown source
  membership still suppresses packed-source target checks.
- 204 Python + 375 Node tests pass; default23 tools, write mode78 including55 actions.
- Progress checkpoint `Sidkick_Playground_GroupOneProgressAirPillage_T62_1793979550612`
  confirmed RESULT_OK/no overwrite. T62 active/sent=false, Gold2131.33984375,
  original Merchant3473432 `(18,20)`/100HP untouched. This is not a Group 1
  completion checkpoint; implementation families remain below.

### Remaining split after the military/construction batches

Resumed at the user's explicit request to finish Group 1, retaining the no-turn
boundary. Complete implementation/fixtures and supported sandbox cases; only
specific unavailable positive/native or turn-dependent checks belong in Group 2.

- Coastal raids implemented as fixed COASTAL_RAID, distinct from land pillage:
  mobile deployed naval combat ship on visible water, adjacent empty visible
  hostile land tile with fresh constructible token, visible owning centre elsewhere,
  known unpacked/nonreinforcing source and native offered/selected permission.
  Same primary-damage/movement-spend verification, stable ship origin; no landing.
  Synthetic Frigate5242937 `(18,23)` normally raided Woodcutter3538997 `(19,23)`:
  movement3→0, damaged=false→true, Gold unchanged. Live typed Python action (not
  MCP transport in this case); no damage effect forced. 205 Python / 376 Node pass;
  tools23/79 including56 actions. Still T62.
- `2a7c0e0`: coastal raids. Enemy-field melee and native naval shore fire now
  implemented. Synthetic Tank5308474 `(17,21)` normally attacked Rifleman4653101
  `(17,20)`: attack1→0, damage21→69 (48 new damage). Native Frigate5242937
  `(18,23)` fired NAVAL_ATTACK at Rifleman4980791 `(19,23)`: attack1→0, damage0→25.
  Shore fire permits a non-defensible district's exact unit but positively excludes
  the visible owning centre/defensible districts, stacks and civilians. No landing.
  Initial broader district exclusion was diagnosed from rural-tile evidence and
  narrowed only for non-entering native shore fire; ordinary/field melee gates stay.
- Separate naval defensible-land-district bombardment implemented with native
  NAVAL_ATTACK (not RANGE_ATTACK, which native ships reject). Exact offered/selected
  district gates and primary district effect verification. Positive coastal fortified
  district case unavailable near the test ship; fixture coverage, no shot claimed.
  No Overrun or turn submitted. 208 Python / 378 Node pass; tools23/82,59 actions.
- `076509b`: enemy-field melee/shore fire. Advanced construction now implemented
  through one typed append-only intent tool: wonder, repair, overbuild, improvement.
  Full fresh owned visible tile token, exact city, native preview/repair source,
  offered/selected BUILD Append and preserved full queue prefix. Explicit
  replace_improvement=true permits only the exact native-previewed intact rural
  improvement for Wonder/unique-improvement placement; overbuild binds one intact
  old building. Default simple construction remains no-repair/no-overbuild.
- Live typed Copan Eiffel Tower/Obshchina replacements at `(24,12)` and Brickyard
  over Guildhall `(25,11)` each appended/verified normally, then only their new tail
  orders were cancelled/verified. Original Scout queue restored exactly; original
  Monastery at `(24,12)` independently remained intact. No completion/repaired HP/
  completed overbuild/Wonder ownership claim. Repair intent fixture-tested; no owned
  damaged case existed. Synthetic enemy Rifleman5111865 at `(24,12)` could not
  natively pillage it during this local turn, so no setup pillage was submitted.
- Building-placement readout now includes native offered improvements and fresh
  visible target tokens; fogged locations have no mutation token. 209 Python / 381
  Node pass; tools23/83,60 actions; no Gold spend/turn.
- `0f43944`: advanced construction. Pantheon selection, class-slotted belief
  selection and religion founding are now implemented as three fixed typed intents.
  Exact definitions, native permission and current slot/claimability gates; founding
  never auto-adds beliefs. Exact local selections/religion readback with prior
  collections preserved, single submission. Fixtures cover native ADD_BELIEF
  permission not overriding UI class capacity. Current Modern save has zero unlocked
  pantheons, zero earned beliefs, an existing religion and no available belief;
  positive earlier-Age choice execution is Group 2, not claimed here.
- 210 Python / 383 Node pass; tools23/84 including61 actions. No turn or religion
  mutated in the live inspection.
- `c12fa72`: religious choices. Independent befriending now uses the exact native
  offered GIVE_INFLUENCE_TOKEN project, met/discovered independent-only target,
  selected Influence quote/cap and single-submission new-event verification. Native
  independent hostility is not incorrectly treated as a cooperative major-player
  war prohibition. No secondary targets or inferred completion/suzerainty.
- Pending city-state bonus selection implemented with exact current picker target,
  met minor/local suzerainty, canHaveBonus and selected native permission. Readback
  proves selected bonus plus consumed picker and preserved suzerainty; not every
  secondary yield/unit/resource effect. Live readout has no known independent and
  no pending bonus selection; positive cases remain unavailable, fixtures pass.
  211 Python / 385 Node pass; tools23/86 including63 actions; T62/no spend.
- `8ed0a9c`: minor diplomacy. Fixed local civilian activity intents implemented for
  founding, excavation, artifact research, owned-settlement spread, Great Person
  activation and current-tile resettle (only if that exact tile is actually offered).
  Role/current tile/owner/packing/reinforcement/ability/native gates; explicit fixed
  operation IDs, not arbitrary commands. Consumption/order/research/population
  readback states precisely which effect is proven. Visible UI-filtered ruins
  outside any settlement accept the native neutral-owner sentinel; no foreign
  settlement conversions or guessed archaeological targets.
- Synthetic Explorer5439548 on existing visible neutral ruin `(14,19)` normally
  queued EXCAVATE hash1548958412, verified without turn or artifact-reward claim.
  Synthetic Explorer5374011 at Copan University `(25,14)` is natively research-
  blocked: Exploration ruins already researched on this continent, Hegemony needed
  for Antiquity. No research request submitted. Synthetic Settler5505085 normally
  founded owned settlement1179665 `(1,8)`, consumed Settler and preserved all17
  prior settlement identities, verified at T62.
- Synthetic Migrant5570622 at Copan and Great Merchant5636159 created for eligible-
  state checks. Great Person activation natively unavailable; no missionaries are
  defined in the active Modern ruleset. Migrant exposes expansion plots, not its
  current centre; no guessed resettlement sent. Explicit destination path follows.
- 212 Python / 388 Node pass; tools23/87 including64 actions. Original Merchant
  untouched; original Explorer2359326 retained. No turn or Gold spend.
- `16943c7`: local civilian activities. Explicit Migrant expansion now implemented
  from authoritative acquire-tile UI: exact current owned source city, native
  RESETTLE offered plot/improvement pair, visible empty same-city/unowned destination,
  no foreign/implicit tile transfer, known packing/reinforcement and selected
  permission. Native duplicate trailing plots with missing type metadata do not
  erase an earlier exact paired choice; conflicting provided metadata rejects.
  Selected-unit logistics exposes the checked visible paired choices.
- Actual typed Migrant5570622 consumed into Fishing Boat17694949 `(27,12)` in
  Copan, exact improvement and population increase to42 verified; pending remains0.
  No guessed city-centre resettle was submitted. 213 Python / 391 Node pass;
  tools23/88 including65 actions, still T62/no Gold spend.
- `eff7d2d`: Migrant expansion. Merchant roads implemented with exact owned visible
  source/target centres, known ready unpacked/nonreinforcing Merchant, currently
  missing endpoint connection, native CONNECT_WITH_ROAD offered/selected permission,
  no extra quoted cost/confirmation or MOVE_TO fallback. Verifies consumption/spend
  and new bidirectional endpoint connection while preserving prior endpoint links;
  not every road hex. Selected Merchant logistics exposes eligible visible native
  endpoint IDs. Already-connected endpoints reject rather than falsely claiming a
  newly built road from an old naval/land connection.
- Synthetic Merchant5701696 normally connected Copan65536 to Ur524295, consumed
  Merchant and new bidirectional connection verified. Original3473432 untouched.
  214 Python / 393 Node pass; tools23/89 including66 actions; T62/no Gold spend.
- `7afd6fc`: Merchant roads. Native archival destination validated read-only, then
  typed archive implemented: exact displayed owned work, undamaged source, native
  MOVE_GREAT_WORK to destination city/building -1, captured complete owned work
  ledger and single submission. Readback proves archive plus all other work
  ownership/locations preserved. Existing empty-slot moves now also verify the
  complete work ledger and reject native confirmation requirements.
- Works13/6 exchanged through explicit archive13 → move6 Palace → move13 Museum,
  every stage verified, then inverse three checked stages restored the exact original
  two-work inventory. This is an explicitly non-atomic primitive sequence, not an
  invented atomic swap operation. Unknown/failed stages stop; no automatic rollback
  or retry. Works6 Museum/Bàakʼ and13 Palace/St. Petersburg restored, no yield or
  Tourism claim. 215 Python / 394 Node pass; tools23/90 including67 actions.
- `6af2bc0`: Great Work archive/full-ledger movement. Explicit surprise/formal war
  declaration now implemented with met-major identity, native war eligibility and
  selected operation gates; bilateral war readback, not full alliance/support
  cascade accounting. Formal declaration against player5 rejected by the native
  relationship gate without submission. Distinct surprise declaration against5
  verified bilateral war; original Franklin4 war retained. No turn advanced.
- Fixed capped hostile sanctions/espionage project starts implemented separately
  from cooperative projects/war declaration. Native offered exact primary quote,
  known Influence balance, no secondary targets/hidden foreign inventory. Live
  Military Infiltration80 and Hinder Research81 against wartime Franklin4 started
  normally and new owned events verified, spending120+90 Influence (174.82421875
  left). No infiltration/research-denial completion or secrecy claim.
- 216 Python / 396 Node pass; tools23/92 including69 actions.
- `d76bc0d`: war/hostile projects. Fixed current-tile PILLAGE_ROUTE wrapper and
  fixtures added with fresh visible route token, occupied enemy non-centre tile,
  exact unit/war/packing checks, stable source and readback requiring movement
  spend plus changed/departed route type. Native current-tile route checks return
  Success without Plots on this build; only this mode permits absent Plots, while
  an explicit empty/excluding list still rejects. Land/coastal picker gates unchanged.
- Field Gun2818084 `(18,19)` first rejected without submission for that absent
  list, then one actual typed route operation submitted. Outcome UNKNOWN: movement
  2→0 and queue0 but route type220465392 remained unchanged through15-second and
  later readbacks. Never retried. No route destruction/loot/connectivity effect
  claimed. Native operation uses UNIT_PLUNDERTRADE sound; road-vs-trade-route
  semantics/effect visibility remain unresolved, not a positive native success.
- 217 Python / 397 Node pass; tools23/93 including70 actions. T62 unchanged.
- Follow-up route investigation confirmed the cause: installed GameInfo.UnitOperations
  has **no PILLAGE_ROUTE definition**, despite legacy interface source and permissive
  canStart replies. Loaded rules instead define UNITCOMMAND_PLUNDER_TRADE_ROUTE.
  Added an installed-definition gate: legacy route requests now reject before any
  submission. The single unknown was never repeated. Physical route destruction is
  unsupported here; real trade plunder remains a separate implementation target.
- `3a81ce6`: legacy route installed-definition guard. Aircraft transfers implemented
  via exact native REBASE into unique owned Aerodrome/squadron/carrier identities,
  visible own/unowned location and water carrier, native offered/selected permission,
  known source stationing and full owned army membership preservation. City rebase
  now also accepts a proven carrier/squadron source. Off-map target stationing and
  the exact membership delta, stable health/clear queue are required.
- Native Biplane4456493 Copan Aerodrome4653104 → synthetic Carrier5767185 `(27,13)`
  verified, then a distinct native carrier→Copan return verified original base
  membership restored. Plane movement restored only as labelled synthetic setup,
  never membership/damage. Isolated Squadron5832769 `(25,12)` was not a native
  rebase destination; strict picker rejected with no aircraft transfer sent.
  Squadron transfer guards/readback fixture-tested, positive native case unavailable.
- 218 Python / 398 Node pass; tools23/94 including71 actions. Still T62.
- `7143d61`: aircraft transfers. Explicit commander-source single-aircraft field
  missions now implemented for Aerodrome/squadron/carrier with exact source ID,
  full membership, native target permission and the same consumption/primary-effect
  readback. Default earlier air action remains city-base-only. Carrier definition
  takes precedence over isSquadronCommander, which native carriers also set true;
  regression fixtures now cover both flags so carrier water guards cannot be skipped.
- Fresh synthetic Biplane5898306 created deployed at carrier; same-tile rebase was
  not offered, rejected without request. Distinct normal city stationing then
  city→carrier journey verified. Movement readiness restored as synthetic setup,
  attacks unchanged at1. Normal carrier-source AIR_ATTACK at Frigate4718629 `(31,14)`
  spent attack1→0, damage51→67 (16), exact surviving source membership preserved.
  Carrier5767185 now holds4456493 and5898306. No interception/splash/kill claim.
- 219 Python / 399 Node pass; tools23/95 including72 actions, T62/no Gold spend.
- `5a60a8f`: commander-source air strikes. Explicit packed-army shore crossing
  implemented: one direct current-turn native noncombat edge, visible empty
  own/unowned destination, consistent embarkation, stable member inventory and
  exact arrival/embark/disembark/clear-queue readback. Navigable rivers are excluded
  from this explicit ocean-shore mode: native river units may be embarked even
  though isWater=false. Existing same-water river travel remains unchanged.
- Synthetic Commander5963843/Rifleman6029380 packed at navigable river `(24,13)`,
  then moved to flat `(25,13)` normally; adjacent ocean goal required native detour
  and future turn, rejected without a shore request. Preserved as separate test army.
- Distinct synthetic Commander6094917/Rifleman6160454 at owned coastal city `(4,6)`
  joined normally, then packed embark `(3,5)`, same-water transport `(4,5)` and
  disembark back `(4,6)` all normally verified with the exact sole member preserved,
  embarkation false→true→true→false and queue0. Only movement readiness between
  completed cases restored synthetically; no placement/member/embarkation forced.
- 220 Python / 400 Node pass; tools23/96 including73 actions. T62 unchanged.
- `217c351`: packed shores/sea transport. Explicit native factory bulk Clear now
  implemented with current resource/count/assignment token, Modern/lock/prerequisite
  gates, exact native ResourceType/City/Clear arguments and full owned resource/
  assignment ledger preservation. Ordinary assignment refuses a different producing
  factory specialization rather than implicitly replacing it; clear then reassign
  is explicitly non-atomic, no automatic retries/rollback or GDP claim.
- No live factory initially existed. Preserved new checkpoint
  `Sidkick_Playground_BeforeFactorySynthetic_T62_1793987169267` (RESULT_OK, no
  overwrite). Native queued Factory over Guildhall `(25,11)`, swapped only that
  test order to head, then **debug-completed** exact Factory with BuildQueue's
  zero-argument completeProduction. Original Scout tail preserved/restored, not
  completed. Factory is synthetic prerequisite; Guildhall replacement/completion
  is not normal production verification, prior checkpoint preserved.
- Normal Tin1378 assignment selected producing factory count1, native full Clear
  verified count0 and exact owned ledger. Different Coffee assignment before clear
  was capacity-rejected without submission (specialization gate covered by fixture).
  After clear, normal Coffee1504 specialization and native Clear both verified.
  Original resource assignments restored exactly; synthetic Factory remains.
- 221 Python / 402 Node pass; tools23/97 including74 actions. T62/Gold unchanged.
- `ee15ca8`: factory reset. Explicit adjacent city-centre melee/occupation and
  separate pending keep/raze handlers implemented with exact owner-qualified city,
  visible empty centre, native melee/NO_COMBAT classification, reachability and
  selected permission. Capture verifies one exact new local settlement with prior
  city identities preserved and arrived/spent attacker; no automatic disposition.
  Keep consumes pending choice; raze proves start, not future destruction. Owned
  decisions readout includes cityId, capture/raze flags and native keep/raze options.
- Synthetic enemy Town851980 `(23,9)` and fresh Tanks6291528/6357065/6422602:
  three normal native melee attacks damaged centre0→50→94→capture, with no district
  damage or ownership forced. Third initially native-blocked by synthetic source
  stacking; earlier spent Tank moved normally to `(23,7)` after labelled movement
  restoration, then first actual third attack captured local city1245202. Explicit
  native keep verified pending=false, city retained. No new war/turn.
- Separate occupation case: too-close `(22,11)` produced no observed city; test
  Tank6488139 remains `(22,12)`. Distinct synthetic Town983052 `(23,14)` was
  **debug-damaged to max100** solely to manufacture NO_COMBAT occupation eligibility.
  Normal native Tank6553676 occupied it, local city1310739 and prior cities preserved.
  Explicit native raze started, city retained/isBeingRazed=true. Occupation execution
  and raze start verified; debug damage is not normal assault proof, raze completion
  remains turn-deferred. Garrison/civilian/stack targets remain outside this family.
- 222 Python / 404 Node pass; tools23/99 including76 actions. T62 unchanged.
- `1240f5b`: settlement assault/occupation/keep/raze. White-peace deal family now
  implemented as separate prepare/propose/accept/reject steps. Each uses one native
  addItem/sendWorkingDeal write, exact met major/war/native peace eligibility and
  a captured single MAKE_PEACE agreement token; no demands or Gold/Influence/city/
  unit/captive concessions. Prepare never clears/replaces existing working data.
  Propose verifies pending negotiation or actual bilateral peace; accept verifies
  bilateral peace; reject verifies pending cleared with war retained. Readout adds
  only supported white-peace incoming/outgoing tokens, no raw foreign city terms.
- Current wars4/5 both natively prohibit peace for10 more turns. Guarded prepare
  rejected both without draft/proposal writes. No cooldown bypass or turn advance;
  positive proposal/acceptance belongs to specific deferred eligibility verification,
  implementation and fixtures are present. Concession editing remains Group 1.
- 223 Python / 406 Node pass; tools23/100 including77 actions. T62 unchanged.
- `e29264f`: white-peace negotiation. Exact city-state unit levy implemented with
  local suzerainty, native offered unit ID/public-type pair (not a hidden foreign
  unit read), known zero primary quote, exact secondary Influence cap and selected
  permission. City-state readout exposes only paired public levy choices and checks.
- First ordinary levy from7 for offered Scout327684 spent60 Influence and produced
  owned Scout6619213 `(37,24)` immediately, but no persistent event existed; original
  event-only verifier returned UNKNOWN. Never retried. Cause established from own
  inventory/native reply; replaced event verification with captured complete owned
  unit ledger, exactly one new chosen-type receipt, preserved prior identities/types,
  exact quoted Influence debit and continued suzerainty. No retroactive success claim
  for the first wrapper outcome.
- Distinct ordinary levy from8 for offered Scout1048576 positively verified new
  owned Scout6684750, all old units preserved, exact60 Influence debit, suzerainty
  unchanged. No synthetic setup, foreign unit-instance inspection, turn or Gold.
  Influence now54.82421875. Prior foreign HP/experience and all transfer-side effects
  are not claimed. 225 Python / 408 Node pass; tools23/101 including78 actions.
- `d179fb6`: exact city-state levies. Real installed trade plunder implemented
  separately from the unavailable legacy physical-route operation: fixed current-
  tile UNITCOMMAND_PLUNDER_TRADE_ROUTE with native UI no-target arguments. Ready
  sole-unit visible source, known packing/reinforcement/treasury, own/unowned or
  existing met-war tile and exact native permission without confirmation.
  Native chooses an eligible trade route; no guessed route ID/owner or hidden
  foreign trade inventory read. Readback requires movement spend, stable source,
  positive Gold gain and command becoming unavailable, not physical road destruction
  or complete route identity/payload/connectivity verification.
- Focused live native scan found no eligible ready owned source; no plunder write
  submitted. Game.Trade exposes route queries, not a supported route constructor;
  native merchant route creation/war eligibility cannot be replaced with fake loot
  or forced verification success. Positive trade plunder remains an eligibility
  verification gap, implementation/fixtures are present. 226 Python / 409 Node
  pass; tools23/102 including79 actions. T62 unchanged.
- `c9bfbaf`: installed trade plunder. Extended narrative choices implemented using
  the authoritative trial UI's linked/requisite choices and same exact native story
  direction operation. Trial requires explicit acknowledgement and the exact current
  discovery/trial head. Paid choices require a known matching Gold/Influence currency,
  native canAfford, actual selected-operation runtime Cost quote under the approved
  cap and known balance; definition Cost alone or missing quote/currency rejects.
  Default zero-cost/non-trial tool remains bounded. Confirmation also rejects.
- Readout now models trial choices and distinguishes native runtime quote from
  definition cost, with write-support flag. Readback proves pending instance consumed
  and net-spend cap only; no full scripted reward/gross debit or trial/Age-effect
  accounting. Current pending queue empty, no active/archived paid parent223A/208A
  found and zero TRIAL definitions in active Modern rules. No narrative mutation
  submitted; positive paid/trial execution unavailable here, fixtures cover it.
- 227 Python / 410 Node pass; tools23/103 including80 actions. T62 unchanged.
- `eaa97f7`: extended narrative. Fixed paired-secondary diplomacy implemented for
  capped allied Gold aid (Amount2), exact visible owner-qualified Hinder Food city,
  and met-major raid victim of a met/discovered independent source (Player3). Known
  zero primary quote plus exact secondary Influence quote/cap, native pairing and
  selected permission; no guessed combined total, foreign city inventory or arbitrary
  argument names. Aid verifies own exact Gold/Influence debits under preserved
  alliance, not foreign private treasury. Other actions verify new own event/start,
  not completed secondary effects. Independent readout exposes met raid victims only.
- Native private setup formed alliance with1 (bilaterally verified), no currency
  spend and wars4/5 unchanged; this is not yet a typed alliance-tool claim. Normal
  native offered50-Gold aid via typed action positively verified exact50 Gold debit,
  zero Influence debit and alliance preserved. Gold2081.33984375, Influence54.82421875.
  Hinder Food not natively offered for visible Franklin centre; rejected without
  request. Converted city-state7 rejected as a raid source; no known independent
  source. Positive Hinder Food/raid cases unavailable, fixtures implemented.
- 228 Python / 411 Node pass; tools23/104 including81 actions. T62 unchanged.
- `08475f0`: paired-secondary diplomacy. Native sole-own-support withdrawal and
  zero-definition-penalty project cancellation implemented with exact active own
  event/counterpart, supported non-war family, one own token/no other supporters,
  CancelPenalty=UnsupportPenalty=0, fresh balances and native UNSUPPORT permission.
  No arbitrary response/global support mutation, incoming projects or paid cancel.
  Readback distinguishes token removed, native canceled and cancellation scheduled,
  with no unexpected net currency debit; no assumed expiry/refund or full effects.
- Hinder Research81's CancelPenalty10 rejected without submission. Ordinary native
  withdrawal of sole Infiltration80 support positively verified ownSupport0 and
  isProjectCanceled=true immediately, no forced cancellation/turn. Original native
  event and supporter data established exact eligibility before submission.
- 229 Python / 412 Node pass; tools23/105 including82 actions. T62 unchanged.
- `dd61f6c`: zero-penalty project withdrawal. Squadron ESTABLISH_BASE now typed,
  with installed-definition/unique squadron identity, native offered/selected checks,
  empty visible own/unowned land without constructibles and captured packed members.
  Verifies exact arrival, movement consumption, stable health/army identity, clear
  queue, preserved membership/owned IDs; no invented established flag or recharge.
  Targeted logistics exposes only the matching filtered native base choices.
- Private native shape probe moved empty test Squadron5832769 `(25,12)→(22,11)`;
  fresh aircraft picker then offered its tile, unlike the unestablished squadron.
  Typed carrier→squadron transfer of4456493 verified. Only test movement restored;
  typed distinct base relocation `(22,11)→(21,12)` carrying4456493 verified all guards
  and exact member retention. No aircraft membership/base state forced. Original
  Squadron4522030 retained. 230 Python / 414 Node pass; tools23/106 including83
  actions. T62 unchanged; grouped air missions remain next, not silently deferred.
- `a2b4800`: squadron base establishment. Native grouped Ground Attack now typed
  with exact squadron/carrier and visible enemy land field target, existing met war,
  complete owned army ledger, role-tagged ready packed Ground Attackers and native
  focused command permission. One command, not repeated individual air attacks.
  Readback requires primary effect plus at least one captured participant consumption/
  loss and exact surviving membership. Partial/all captured consumption distinguished.
- Fresh test Biplanes6750287/6815824 transferred to Squadron5832769; native Ground
  Attack rejected without write because Fighters instead perform location-based
  Fighter Sweep. Loaded command description/tags establish that distinction, now
  enforced by handler/fixtures. Fresh Ground Attacker6881361 transferred normally;
  second6946898 was not offered at the now-full squadron and remains deployed at
  Copan. Only movement restored; no attack counters/membership/damage forced.
  Native grouped Ground Attack with6881361 dealt17 to Rifleman5177402 `(23,15)`,
  consumed its attack and preserved all army memberships. This live case had one
  eligible Ground Attacker; multi-participant partial/all cases fixture-verified.
- 231 Python / 416 Node pass; tools23/107 including84 actions, T62 unchanged.
- `4302803`: grouped Ground Attack. Fighter Sweep and Carpet Bomb now separate
  typed intents using native role-tagged fighters/bombers and same full membership
  guards. Sweep targets a visible own/unowned location, not a guessed enemy aircraft.
  Native sweep by6750287/6815824 at `(23,15)` consumed both missions with stable base
  and exact memberships. No interception/kill/new sight gain claimed. Only squadron
  movement restored after prior completed Ground Attack; Fighter counters untouched.
- Fresh Bomber7012435 transferred normally into Carrier5767185, movement restored
  only. Attempted synthetic Town at `(21,20)` produced no observed city. Native
  offered existing empty enemy district2424868 `(23,21)` instead: rural maxHP0 with
  intact constructible7340143. Rural bombing requires its fresh full constructible
  token and verifies new damage/departure rather than invented district HP. Native
  Carpet Bomb consumed Bomber attack and damaged that constructible, all armies
  preserved. Fortified district HP variant fixture-tested, no positive nearby case.
- 232 Python / 417 Node pass; tools23/109 including86 actions, T62 unchanged.
- `4dafe4b`: Fighter Sweep/Carpet Bomb. Economic peace concession editing and
  proposal/responses now typed separately from strict white peace. Exact full draft
  token plus one native valid lump-sum offer token for add, exact item ID for remove;
  never clear existing work or edit/send in one step. One MAKE_PEACE agreement and
  at most one native Gold/Influence lump each, gross local spending caps/balances,
  no demands or asset concessions. Whole normalized terms/unchanged balances verify
  edits; acceptance requires actual bilateral peace and agreed own currency deltas.
  Diplomacy exposes only supported draft tokens/public native negotiation offers,
  never unfiltered city/unit/captive terms or foreign private treasury inventory.
- Native600/1500 Gold and120/300 Influence negotiation quotes read successfully.
  Both wars still native10-turn cooldown blocked; attempted economic edit rejected
  before draft/offer mutation, not bypassed or counted as positive execution.
  Specific positive economic negotiation remains a deferred eligibility case.
- 233 Python / 420 Node pass; tools23/110 including87 actions, T62 unchanged.
- `b59cd74`: economic peace. Native adjacent founding and explicit foreign-centre
  spread now separate typed intents, retaining local-only default activity tool.
  Adjacent founding accepts a ready embarked founder, exact visible empty unowned
  adjacent land and native offered/selected permission; verifies consumed founder,
  exact new city and preserved prior settlement IDs. No ability/path substitution.
  Foreign spread requires exact owner-qualified met foreign centre under the ready
  missionary, visible source/no foreign stack/positive native charges. Only metadata
  identity checked; no foreign population/yields/religion inventory reads. Verifies
  own charge/unit consumption, not complete spread effects.
- Synthetic Settler7077972 appeared embarked at `(8,15)` as requested. Native
  adjacent founding picker/selected `(9,16)` both rejected; typed handler rejected
  before request. No alternative operation/founding effect forced. Active Modern
  still has no spread-capable unit definitions, so no synthetic Missionary invented.
  Positive adjacent-found/foreign-spread cases remain specific eligibility gaps,
  implementations and fixtures present. 234 Python / 421 Node pass; tools23/112
  including89 actions, T62 unchanged.
- `99c7511`: adjacent founding/foreign spread. Continuing toward the user's
  tomorrow-morning target: close remaining concrete implementation gaps, no turns
  or silent scope expansion; positive eligibility gaps stay distinct from code.
- Capped own-project support withdrawal now supports known nonzero native definition
  penalties and exact one-token decrement from multiple local tokens. Default tool
  stays sole-token/zero-penalty. Captures other known supporters and verifies their
  support preserved; removing last own token with other supporters rejects rather
  than risk implicit project abandonment. Definition caps are not currency quotes
  or complete relationship-effect guarantees; unexpected net currency debit fails
  verification. Hinder Research81 native cancellation verified with cap10; cap9
  rejected without request. Project73 native support2→1 verified, original project
  retained and not canceled. Native getSupportingPlayers repeats players per token
  (`[0,0]`); diagnosed and fixture-covered, no duplicate write.
- Multi-token setup used labelled500 Influence grant, normal extra token150, then
  exact typed withdrawal. No new collaboration was started (native single-instance
  gate rejected). Disposable budget reset to recorded54.82421875 after original
  project73/count1 restoration. Merchant3473432 `(18,20)`/100HP independently intact.
  New no-overwrite progress save `Sidkick_Playground_GroupOneAirDiplomacy_T62_1793994262110`
  confirmed RESULT_OK before budget setup; no unrelated checkpoints overwritten.
- 235 Python / 422 Node pass; tools23/113 including90 actions, still T62.
- `8844bf2`: capped/multi-token withdrawal. Bounded independent field-combat
  observations implemented: fixed internal bundled helper (no caller JavaScript),
  1–3 radius visible known-unit health snapshot, attacker retaliation/nearby health
  deltas, exact native Combat and UnitKilledInCombat attribution. Native schema
  established through ordinary attacks: Combat supplies attacker/defender/interceptor/
  antiAir IDs, kill event supplies unitKilled/unitKiller. No guessed damage schema.
  Death confirmed only for a captured known unit killed by this exact local attacker
  (or attacker killed by captured enemy); disappearance/visibility loss stays unknown.
  Bounded64-event buffers, one active observer, replacement/expiry/context cleanup
  and successful-read closure; no hidden/unmet unit-instance reads. Full hidden,
  out-of-radius, district/interception/global effects remain explicitly unaccounted.
- Native typed observed Tanks7274583/7340120 attacked fresh test Rifleman5242939
  `(22,16)`: first observed damage0→40 plus attacker retaliation14, then second
  attack positively confirmed native kill5242939 by7340120 plus retaliation15.
  Nearby old Tank7143509 and first attacker preserved/health unchanged on second
  read. No damage/kill/attack counters forced. Actual nonzero secondary splash is
  fixture-tested, not claimed as a positive native case. Earlier private schema
  probes used distinct Tanks7143509/7209046 against normally damaged5177402; all
  diagnostic listeners cleared, never used as typed-observer verification proof.
- 237 Python / 427 Node pass; tools23/114 including91 actions. Still T62.
- `9ec0bec`: bounded field combat effects. Exact single-city OFFER peace concessions
  now implemented separately from economic-only negotiation: targeted read-only
  known-counterpart/city-owner/ID/visible-centre query, native offer token and full
  draft binding. Edit does not send; propose/accept/reject separate. One exact city
  plus optional existing capped economic lumps; no last-own-settlement concession,
  unknown city terms, hidden centre metadata or foreign private city inventories.
  Acceptance verifies recipient centre ownership (including native owner-qualified
  ID changes), every unaffected own city and agreed own currency deltas. Settlement
  contents/works/units can transfer/relocate and are explicitly not fully inventoried.
- Native Copan city-offer token read without draft mutation; write rejected at
  native peace cooldown before any settlement/draft change. Give/receive, ledger
  preservation, stale token, hidden/unmet/unsupported terms and last-city guards
  fixture-tested; positive transfer remains a specific cooldown eligibility gap.
  All24 default read-only tools discovered and called successfully over real stdio
  MCP (2025-11-25 protocol). Decisions now supplies cityOwner with cityId for safe
  targeted checks. 238 Python / 431 Node pass; tools24/116 including92 actions.
- Native enum-only own-unit/captive/technology deal offers returned empty; Great
  Work offers returned2 and still need assessment/implementation, not declared
  unavailable merely because the current peace UI lacks their editors.
- `17c28ef`: exact city concessions. Great Work negotiation assessment found a real
  binding blocker: the2 own offers have the same complete own property list and
  byte-identical serialization, no work index/identity or hidden prototype accessor.
  Cannot safely distinguish one work by native offer or bind a typed request to it;
  no array-order guess/opaque write submitted. This is an implementation/API identity
  blocker, not a positive-execution-only gap or completed Great Work concession.
- Heavy/Light Fleet focused attacks implemented through fixed native SEA_RANGED/
  SEA_MELEE commands, exact Heavy/Light role tags, ready deployed known participants
  in native radius and individual NAVAL_ATTACK permission. Light ships must already
  be adjacent/native-reachable. No district/stack/civilian/landing/capture/new war.
  Bounded observer now attributes to captured attacker lists, not commander ID;
  explicit observed land-group wrapper uses the same existing land-role guards.
- Heavy test Fleet131073 unpacked3 captured Dreadnoughts normally; only movement
  restored. Native Heavy command against test5308476 returned primary57 damage
  while its second captured shot was still resolving. Later target departed and
  two ships spent; original observer closed too early, so no kill claim or repeat.
  Fixed observed verification to require500ms without a captured native event before
  closure/success (within15 seconds). Quiet is not full/global-effect proof.
- Distinct native Light command from new test Fleet7536731 used Ironclads7405657/
  7471194 against fresh5374013: both attacks consumed, damage0→65, retaliation30/24,
  two native Combat events, quiet544ms. Earlier Fleet131073 could not command those
  tiles outside its actual radius; no request was sent from it for Light combat.
  A distinct Heavy command with previously unspent4259882 against5374013 then
  confirmed native kill with quiet568ms. No attack/HP counters forced or old request
  repeated. Existing ships retained; all3 test Dreadnoughts now deployed/spent.
- Distinct native observed land Focus Fire from test Commander7602268 with Field
  Guns7667805/7733342 dealt47 to5439550 `(21,17)`, both attacks consumed, two native
  events and quiet533ms. Synthetic creation only. 240 Python / 434 Node pass;
  tools24/118 including94 actions. T62 unchanged.
- `77fe2d1`: fleet/observed group combat. Squadron Infantry transport now explicit:
  native per-unit join/leave requires exact Squadron/Airborne Forces, Infantry tag,
  land base/deployment and complete owned membership ledger. Separate native
  Airdrop intent requires sole packed Infantry, empty visible own/unowned flat/hill
  native offered/selected landing; no mixed payload/implicit mass deployment. Verifies
  exact landing, all other memberships, unchanged Squadron position, both health
  baselines and no queued orders. Selected logistics exposes qualified Infantry
  join/leave and single-payload Airdrop destinations without writing.
- New test Squadron7798879 received labelled15XP, typed native Airborne Forces
  promotion, typed base establishment at `(22,11)`, then fresh Rifleman7864416 packed
  through normal membership. Native Airdrop to `(23,12)` verified with empty Squadron,
  unchanged base/health and all other armies preserved. Immediate re-pack rejected
  without request due spent readiness; after labelled movement restoration only on
  these two test units, native re-pack then individual leave to `(23,11)` verified.
  No location, membership or damage effect forced; other squadrons unaffected.
- 242 Python / 437 Node pass; tools24/121 including97 actions. Separate progress
  save `Sidkick_Playground_GroupOneFleetAirlift_T62_1793997593881` confirmed RESULT_OK,
  no overwrite. Merchant3473432 `(18,20)`/100HP independently intact; still T62.
- `05e497b`: single-payload Squadron airlift. Ordinary unit bounded travel now
  implemented as a separate intent:1–8 native current-turn edges, every destination
  visible/empty/same land-water surface/reachable/noncombat, no queued future order,
  no shore crossing/fog exploration. Optional exact peaceful counterpart permits
  that met nonwartime owner's non-district fields only. Authoritative world-input
  uses `willMoveStartWar(unit.id,{x,y})`; every path edge must return Success=false,
  with exact native MOVE_TO permission and no confirmation. Never infer open borders.
  Revalidates path/diplomacy/readiness and verifies clear queue, health/embarkation,
  exact destination and preserved selected peace.
- Native Scout7995490 moved `(19,18)→(19,19)`; test Frigate7929953 travelled2 edges
  `(54,36)→(53,35)→(54,34)`, preserving peace with1, health and queue0. Immediate
  two-edge return with only1 movement rejected before submission (future-turn path).
  After labelled restoration of only this test ship's movement, distinct two-edge
  native return into player1 `(54,36)` verified; no border access/location forced.
  Synthetic unit creation only for outbound cases, no turns. 243 Python /439 Node
  pass; tools24/122 including98 actions.
- `c765236`: bounded ordinary/peaceful travel. Existing single-aircraft strike,
  explicit commander-source strike, Ground Attack, Fighter Sweep and Carpet Bomb
  now accept optional strict `observe_effects=true` without adding tools or relaxing
  their native target/role/membership guards. Same fixed bounded observer captures
  visible health deltas, packed local aircraft health and exact local participant
  Combat/kill events;500ms captured-event quiet before closure/readback success.
  District disappearance is not destruction, unseen interception remains unknown.
- Native observed two-aircraft Ground Attack from test Squadron7798879 used fresh
  transferred8061027/8126564 to finish normally damaged5439550 at `(21,17)`: both
  missions consumed, two native events and kill5439550 by8126564, quiet554ms, full
  surviving memberships/base preserved. Multi-aircraft Ground Attack is now positive
  native, not fixture-only. Separate newly transferred8192101 individual strike
  dealt21 to fresh5505087 there, exact event, quiet1972ms and base/membership intact.
  Creation plus post-transfer movement restored only, no attacks/HP/effects forced.
  Optional observed Sweep/Bomb paths fixture-tested; their earlier native execution
  did not test this new observation option.244 Python /441 Node pass; counts unchanged.
- `351ba65`: opt-in air effects. Single-Infantry Airdrop now permits other stationed
  aircraft while explicitly capturing/verifying their health, attacks, movement,
  off-map status and exact packed membership unchanged. Multiple Infantry/other
  ground payloads still reject; no implicit extra unit deployment. Selected readout
  separates Infantry payload IDs from retained aircraft IDs. Native test7864416
  dropped from `(22,11)→(21,10)` while8061027/8126564/8192101 stayed packed/spent/
  unchanged. Initial spent-Squadron readiness rejected before a write; only test
  Infantry/Squadron movement restored for setup, aircraft counters untouched.
  244 Python /442 Node pass; tools24/122 including98 actions, still T62.
- `82fc4c0`: retained-aircraft Airdrop. Mass Infantry Airdrop implemented with exact
  complete2–7 payload IDs, only known stationed aircraft allowed alongside, and a
  fully visible/empty own-unowned seven-cell flat/hill footprint without districts.
  Native can choose individual cells; verifies distinct observed payload landings
  inside the captured footprint, one on selected target, unchanged payload health,
  base position/health/queue, all other memberships and retained aircraft counters.
  Selected logistics exposes exact payload and guarded landing footprint; no inferred
  per-unit slot assignment, hidden landing, foreign occupation or automatic retries.
- Private native schema probe8257638/8323175 at target `(17,13)` established actual
  spread to target and `(16,13)`, retaining both aircraft. Separate typed test used
  new8388712/8454249 and target `(17,14)`; both native landings verified at `(17,14)`
  and `(16,14)`, retained8126564/8192101 unchanged, base still `(22,11)`, queue0.
  Probe units moved away through normal native movement after labelled readiness
  restoration. Fresh payload creation and Squadron movement restoration only; no
  health/landing/membership forced. Test aircraft8061027 was normally transferred
  to Carrier5767185 to free base capacity, with its spent attack retained.
  245 Python /443 Node pass; tools24/123 including99 actions, T62 unchanged.
- `42cae6a`: mass Infantry drop. Explicit own-side war support now uses exact
  revealed ongoing local war/event/counterpart, native next-support Influence quote
  and fixed SUPPORT_DIPLOMATIC_ACTION one-token side arguments. Cannot back another
  war or the enemy side. Captures local/met support/opposition counters only (never
  unmet player state), verifies chosen increment, all other captured counts, exact
  Influence debit and unchanged Gold with war retained. Strength/yields/global
  diplomatic consequences are not inferred. Diplomacy readout exposes side/count,
  runtime next quote and native availability.
- Native war78 support0→1 verified at exact180 Influence debit after labelled
 180 disposable Influence grant; cap179 rejected without request. Final balance
  back to original54.82421875 without any forced cleanup. Next native quote rose
  to270 and unaffordable, war82 still0/quote180. Defender-side argument/readback
  fixture-tested; current save has only local-initiated wars. Separate checkpoint
  `Sidkick_Playground_GroupOneMassAirTravel_T62_1793999240784` confirmed RESULT_OK
  before support budget setup, no overwrite.246 Python /446 Node pass; tools24/124
  including100 actions. T62 unchanged.
- `6e0793d`: runtime-capped own-war support. Optional bounded combat observation
  extended to existing land/naval district bombardment, without new tools or
  relaxed target/attack checks. Captures visible garrison/nearby-unit health and
  exact native unit-kill evidence, with500ms captured-event quiet. District damage/
  departure stays separate; district destruction/capture never inferred.
- Native observed fresh Field Gun8847471 `(19,20)` attacked196610 `(18,21)`, district
  damage10→25, attack consumed, quiet566ms; original Merchant3473432 and captured
  visible garrison/nearby units unchanged. No damage/attack effects forced.
- Positive splash-observation gap closed: fresh Katyusha8519786 dealt14 to5570624
  `(17,13)` and3 to adjacent5636161 `(18,12)`. Captured nearby friendlies unchanged,
  quiet1719ms, exact primary Combat event, no kill claimed. Fresh creation only.
- Optional observed Fighter Sweep now positive native: Fighter8585323 mission
  consumed with stable full memberships/base, quiet1078ms and no enemy Combat event
  (not an interception claim). Test Squadron7798879 then normally relocated packed
  from `(22,11)→(19,18)`; only Squadron movement restored after completed operations.
  Fresh Bomber8650860 normally Carpet Bombed fortified150HP district4063293 `(15,23)`
  damage0→33, mission consumed, base/membership stable and quiet2660ms. No fortified
  HP/eligibility/effects forced. Fortified Carpet Bomb no longer fixture-only.
- Fortified naval positive still unavailable: isolated visible Coast `(16,19)` was
  the only nearby empty water; fresh range2 Dreadnought8716397 native-rejected, no
  eligible upgrade/exit. Distinct range3 Battleship8781934 actually appeared there
  beside that labelled test ship, but both native naval/ranged pickers rejected.
  No bombardment request, range/HP override or fallback submitted; not a normal
  naval source-placement proof.247 Python /447 Node pass; counts unchanged.
- `f43158c`: district observation/native splash checks. Existing direct commander
  Heroic Assault and empty-centre settlement assault/occupation now accept optional
  strict `observe_effects=true`. Source/target/membership/city-ledger guards unchanged;
  same bounded visible-unit health/native exact kill evidence and500ms captured-event
  quiet. Captured settlement ownership is still independently proven and keep/raze
  separate; neither visible disappearance nor optional observation implies full
  conquest/global effects. Observer integration no longer unimplemented here.
- Native observed Commander7602268 used normal typed Steadfast→Bulwark→Defilade→
  Resolute→Duty after labelled1000XP. Initial spent movement rejected before any
  attack; after only Commander movement restoration, native Heroic Assault dealt
 40 to5505087 `(21,17)` (damage21→61), source/packing stable, quiet503ms, exact native
  Combat event. No attack counter/ability effect forced; not a recharge proof.
- Observed assault/capture option fixture-tested, not yet positive native. Current
  revealed enemy4 centres all contain units; one separate Tuner CITY setup at empty
  unowned `(16,13)` produced no observed city/district even after bounded wait. No
  city assault, forced HP depletion or setup retry followed. Separate
  `Sidkick_Playground_BeforeObservedCapture_T62_1794000415164` confirmed RESULT_OK
  before setup.248 Python /449 Node pass; counts unchanged, still T62.
- `73d8759`: direct/capture observation integration. Explicit alliance form/cancel
  now implemented as separate typed native intents. Formation requires exact unique
  runtime zero-cost offer/fixed FORM_ALLIANCE operation; cancellation requires
  installed known zero cancel/unsupport definition penalties, no nonzero runtime
  quote/confirmation. Bilateral flags/pending-deal/peace checked; readback proves
  both flags, unchanged own balances and captured known local wars. Access, projects,
  relationships and broader diplomatic consequences may change and are not fully
  accounted for; no forced eligibility or rollback.
- Native formation3 blocked because that counterpart allies with our wartime enemy
  Ashoka; wrapper rejected before mutation. Formation1 returns already_active,
  preserving existing alliance. Cancellation deliberately not submitted just to
  destroy that baseline; form/cancel effects fixture-tested, not live verified by
  these typed handlers. Real opt-in stdio MCP exposed125 tools and returned the
  expected no-op; all24 read-only tools called successfully. Initial alliance Node
  failures traced to fixture returning undefined instead of native boolean false
  for peace; fixture corrected, guard not weakened.249 Python /451 Node pass;
  tools24/125 including101 actions, T62 unchanged.
- `db4bfe4`: explicit alliances. Remaining installed Modern espionage variants
  implemented in existing fixed families, based on age-modern diplomacy-actions.xml:
  Fake Artifacts / Infiltrate Enemy Positions / Sabotage Space Program have no
  secondary; Sabotage Shipping / Ideological Revolt require a settlement. The latter
  use exact owner-qualified visible-centre aliases and known zero primary quote,
  exact selected secondary cost/cap, never hidden-city scan or guessed total.
  Extended capped own-project withdrawal recognises all five, retaining default
  list/penalty behavior and third-party abandonment guards.
- Native local UI returns all five as PROJECT_NOT_UNLOCKED/-2, "Action not unlocked".
  Fake Artifacts wrapper rejects before submission. No definition-only eligibility,
  raw secondary fallback, unlock/turn override or project completion claimed.
  250 Python /452 Node pass; counts unchanged.
- Great Person investigation correction: synthetic5636159 is the generic
  `UNIT_GREAT_MERCHANT` placeholder (literal untranslated name and no native
  activation profile offered). It is not evidence that proper loaded Great People cannot
  activate. Concrete unique-person definitions are present; investigate those
  before classifying this family's positive verification as unavailable.
- `7214b5e`: Modern espionage variants. Concrete Santa Anna's native quote identified
  the actual prerequisite: co-location with an Army Commander, not an ability-list
  entry. Named Great People can also return an empty getAbilities list. Existing
  typed local activation8913008 on new Commander8978545 normally retired the GP and
  changed level0→5 / promotion points0→5 / XP remainder0, creation-only setup.
- Added exact-target Santa Anna effect handler: one unambiguous co-located Army
  Commander, full owned unit/membership ledger, installed individual profile with
  one charge/no currency or scaled costs, native exact English five-promotion quote,
  zero target XP remainder and normal permission. Verifies retirement, exactly+5
  levels/available points, zero remainder, unchanged target health/location/queue,
  preserved other unit identities/memberships and own balances. It does not allocate
  promotions or claim every trait/secondary consequence; other GP profiles separate.
- Distinct typed9044082→Commander9109619 at `(26,11)` verified the same five-level/
  point native effect. First probe pair and placeholder preserved; no XP, retirement,
  bonus, readiness or membership effect forced. Installed age-modern greatpeople.xml
  and greatpeople-gameeffects.xml confirm Commander target and grant5 promotions.
  251 Python /454 Node pass; tools24/126 including102 actions, still T62.
- Separate checkpoint `Sidkick_Playground_GroupOneMilitaryGreatPerson_T62_1794001918433`
  confirmed RESULT_OK/no overwrite. Original Merchant3473432 `(18,20)`/100HP,
  Gold2081.33984375, Influence54.82421875 and alliance1 independently intact. Earlier
  unsuccessful Town setup remains empty; no delayed capture or setup retry claimed.
- `3714457`: exact Santa Anna effects. Existing Commander Great Person tool now
  accepts explicit `effect="heal"` for Morelos, retaining default promotion behavior.
  Requires actual no-cost single-charge profile/native English quote, exact Army
  target, native radius and complete owned-health/membership ledger. Requires a
  wounded selected-radius recipient (including known packed projection), preserves
  target experience, source retirement, unit identities/armies/balances. Readback
  accounts for unchanged health or native99 damage reduction, reporting additional
  owned-unit healing outside the selected radius separately. Unexpected damage,
  partial/unexplained health changes or identity/max-health changes stay unknown.
- Native evidence corrected a false assumption: selected radius is not an exclusive
  effect boundary. Morelos9175156 retired/healed actual14-damaged packed7274583 but
  first full health check failed; original outcome remains UNKNOWN, never retried.
  Tank7340120 subsequently healed after moving into that area without a second
  activation; not normal turn healing or proof of exact persistence semantics.
- Distinct isolated9306230→Commander8978545 with explicitly debug-injured deployed
 9371767 healed14→0 and full owned-health audit passed. Separate9437304→9109619
  healed packed9371767 but also distant packed7274583: audit proved selected14→0
  and remote7→0, so exclusive-radius prediction returned UNKNOWN, never repeated.
  Native data has COLLECTION_PLAYER_UNITS / REQUIREMENT_PLOT_IN_COMMAND_RADIUS /
  Amount=-99 / ApplyToArmy=true; exact broader/future eligibility remains unproven.
- Regression now models observed wider healing explicitly, not an unchanged-outside
  promise. Distinct source9240693 (earlier rejected before submission) activated once
  on7602268 with labelled synthetic packed injuries14 selected/7 remote. Primary
  healed7274583 plus additional9371767 reported separately; full audit, retirement,
  experience/inventory/armies/balances verified. This is synthetic injury/native
  execution proof, not natural injury or future/no-turn-healing verification. No
  forced healing, original unknown-source resubmission or turn advancement.
- 252 Python /455 Node pass; tools24/126 including102 actions unchanged. Separate
  `Sidkick_Playground_GroupOneMorelos_T62_1794003553486` confirmed RESULT_OK, no
  overwrite. Merchant3473432 `(18,20)`/100HP, Gold2081.33984375,
  Influence54.82421875 and alliance1 independently intact; still T62.
- `8c270bd`: Morelos primary/wider health. Incoming revealed hostile-sanction replies
  implemented as a separate intent, not a relaxed cooperative response tool. Fixed
  Denounce/military-presence and treasury/morale/research/civic/military/food sanction
  types only; exact ongoing revealed local incoming event, no prior response, met
  peaceful major, exact unique native response/canSelect/cost/cap/permission. Rejects
  confirmations and context/quote/balance/diplomacy changes; verifies recorded reply,
  exact own Influence debit, Gold unchanged and peace/alliance retained. Does not
  infer continuing sanction, relationship/cooldown or hidden espionage consequences.
  Read-only response options identify the separate hostile tool.
- Native wrapper rejects known cooperative event67 before a write. One labelled
  synthetic Denounce setup from met nonallied3 to0 had native offered status and
  quote175 / permission=true, but produced no revealed new incoming event even
  after bounded wait. Setup outcome/spending not verified (the setup label alone
  is not spending evidence); no reply or repeated setup submitted. Positive hostile
  reply remains unavailable; fixture coverage is not live execution proof.
- First-meet investigation: native getFirstMeetResponseCostAndRelDelta yields
  friendly20/+20, neutral0/0, unfriendly20/-20. Native response canStart returns true
  for already-met3 with no pending session notifications, so permission cannot prove
  a real first-meet choice. No greeting submitted, generic permission-only handler
  intentionally not implemented. Need actual pending notification/session evidence
  before safely binding a reusable first-meet response; still implementation work.
- 253 Python /456 Node pass; tools24/127 including103 actions, T62 unchanged.

**Group 1 is not complete.** Do not relabel unimplemented features as verification
blockers or start Group 2 turns simply because these completed batches passed.

| Group 1 implementation still needed | Current boundary |
|---|---|
| Combat/capture and hostile diplomacy | White/economic/single visible OFFER-city peace handlers implemented, native-cooldown blocked. Great Work deal offers still need implementation; own unit/captive/tech offer lists empty. Native trade plunder fixture-tested with no eligible source; legacy physical-route operation absent. Empty-centre city assault/capture decisions live-verified. |
| Military transport | Bounded/peaceful ordinary travel, single/mass Infantry Airdrop with retained aircraft, membership, fleet/army commands, squadron relocation/air missions and packed-army sea travel implemented/native-verified. Observed Sweep and fortified Carpet Bomb now verified; fortified naval positive remains native-blocked. |
| Construction/resources | Advanced Wonder/repair/overbuild/improvement queue intents and explicit factory clear/reassign rules implemented. Factory switch/reset verified with synthetic structure prerequisite; normal completion/repair positive cases remain separate verification gaps. Atomic swaps lack a live eligible pair. |
| Civilian/cultural/religious | Founding/adjacent intent, resettle/roads, archaeology, spread/religion and archive-buffer exchange implemented. Santa Anna promotion and Morelos primary/wider-owned healing effect accounting implemented/native-verified with labelled synthetic prerequisites. Other effect-specific GP profiles remain unimplemented, not verification-only. Adjacent founding/Modern Missionary remain eligibility gaps; original Merchant intact. |
| Diplomacy/choices | Great Work/other asset variants still need implementation; Great Work offers lack identity, unit/captive/tech lists empty. Alliance form/cancel, five Modern espionage variants and explicit revealed hostile-sanction replies implemented; eligibility blocks positive tests. Own-war support/capped withdrawal verified. First-meet still needs a pending-choice binding (native permission alone is permissive); other mandatory variants remain distinct from paid/trial/independent/bonus verification gaps. |

Group 2 remains deferred: normal turn refresh/healing/reinforcement arrival,
recharge/completion, unattended turns and Age transitions; positive native Overrun
and live atomic-swap eligibility; natural-use verification for debug-created air/
combat cases. Multi-participant Focus Fire and coordinated melee now have positive
synthetic native execution, no longer fixture-only. Bounded independent kill/visible
collateral accounting exists for explicit observed field/land-group/fleet/air
strikes, with positive native kill/retaliation/splash evidence, plus optional district
bombardment/direct-commander/capture observation. Optional observed capture positive
execution still needs an eligible empty centre; full hidden/
global effects are not promised.

## Existing baseline

At `a410139`: 13 opt-in writes, 23 default read-only tools; 118 Python and 253
Node tests passed. Live successes: research/civic selections, Great Work move,
cooperative diplomacy/incorporation starts, unit/building purchases, queue append,
direct Merchant route, population placement, resource assignment and adjacent
embarked movement. Positive ordinary-policy toggles and attribute purchases still
need a suitable live case. Land-only/naval movement currently has fixture coverage.

## Historical baseline priority order (superseded by current Group 1 table above)

| # | Capability family | Remaining work | Status |
|---|---|---|---|
| 1 | Settlement management | Town focus, town-to-city upgrades, specialists | Implemented; live-verified (synthetic prerequisites for upgrade/specialist) |
| 2 | Mandatory choices | Government, celebrations, tradition/crisis slots, policy swaps, narrative/crisis responses and blocking pickers | Picker/review/agenda/card-group, zero-cost non-trial narrative and cooperative project responses implemented; paid/trial/hostile/deal responses pending |
| 3 | Everyday unit control | Skip/sleep/wake/fortify/heal, promotions/upgrades, longer paths, shore transitions, peaceful foreign travel/exploration | Basic orders, promotions/upgrades, ordinary rail and adjacent shores implemented; extended travel pending |
| 4 | Guarded turn completion | Exact one-turn submission, blocker handling and next-local-turn readback; stop on unsupported blockers | Implemented; 59 → 60 verified, 60 → 62 anomaly unresolved; further turns deferred by user |
| 5 | Advanced construction/resources | Queue edits, Wonders, repairs, overbuilding, unique improvements, unassignment/swaps/factory rules | Queue cancellation/adjacent reorder and resource unassignment/swaps implemented; other items pending |
| 6 | Civilian/cultural actions | Found/resettle, Merchant travel/roads, archaeology, religion/beliefs/spread, Great People, Great Work swaps/archive | Pending |
| 7 | Fuller diplomacy | Responses/support/cancellation, independent befriending, city-state bonuses/levies, secondary targets and deals | Incoming cooperative response/support implemented; other items pending |
| 8 | Military logistics | Commander movement, packing/unpacking/formations, reinforcement, rail/rebase/transport | Bounded land/fleet movement, pack/unpack, land/naval membership, reinforcement assignment, rail and city-Aerodrome rebase live-verified; further air/transport pending |
| 9 | Combat/hostile actions | Attacks/captures/pillage/raids, war/peace, espionage, each separately validated | Individual melee/ranged/naval/enemy-field, Focus Fire/coordinated melee, Heroic Assault and district bombardment live-verified; native Overrun still lacks positive execution |
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
| Immediate military verification | Positive native Overrun remains unavailable. Two-participant Focus Fire/coordinated melee now live-verified with synthetic setup; natural readiness, reinforcement arrival, HP recovery and post-attack packed movement through normal turns remain deferred. |
| More commander abilities | Second Wind, direct Heroic Assault and capped all-packed-member upgrades live-verified with labelled setup. Other installed variants require their own coverage. Force March lacks an installed command definition and is not exposed. |
| Military transport and travel | Land/naval individual membership, full-fleet pack/deploy/movement, ordinary/commander rail and city-Aerodrome aircraft rebase live-tested with labelled setup. Air membership, fleet/squadron abilities, army naval transport, longer paths, foreign/fog travel and packed shore crossings pending. |
| Broader warfare | Enemy-field ranged, native naval shots, Heroic Assault, district ranged bombardment, constructible pillage and single aircraft city-base field strikes live-verified with labelled setup. Enemy-field melee, capture/occupation, route pillage/coastal raids, shore bombardment and full kill/splash accounting remain unimplemented. Other attacks retain own/unowned field boundaries. |
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
- City-only rebase batch committed as `9386a78`.
- Existing generic commander tools also positively exercised on Fleet Commander
  131073: native pack-nearby selected four ships at capacity (1703961/1769498/
  3276822/3342357), leaving fifth ship1835035 outside. Both checked packed moves
  `(46,30) → (46,29) → (46,30)` verified exact membership preservation. Only the
  drill's initial readiness was privately restored; no resets between those moves.
- First full-fleet UNPACK_ARMY returned unknown at the ordinary2-second readback
  deadline while membership remained packed. Later read-only inspection proved
  membership empty and all four members deployed, queue0. The command was never
  repeated. This established delayed native deployment, not a rejected unpack.
- Pack/unpack wrappers now use the existing bounded15-second commander readback
  window; generic action deadlines/submission counts remain unchanged. New tests
  failed before the fix and prove delayed readback cannot resubmit the action.
- A distinct second pack/unpack case after confirmed full deployment (with explicit
  renewed movement setup) verified both operations through actual MCP. Timings:
  pack0.225s, unpack0.198s. This confirms execution but does not itself positively
  exercise the extended window; the delayed fixture does. No automatic retries.
- 181 Python + 341 Node tests pass. Tools unchanged: default23 read-only,
  write mode66 including43 actions. Final native checkpoint
  `Sidkick_Playground_AfterAirNavalLogistics_T62_1793966046841` confirmed RESULT_OK,
  no overwrite. T62 active/sent=false, Gold4731.33984375 unchanged. Fleet commander
  `(46,30)` empty/queue0; five nearby combat ships deployed/queue0/HP100. Both
  land armies retain their original members; original Merchant `(18,20)`/HP100.

## Naval attacks and rail continuation, 2026-11-06

Existing Playground authorization covers continued naval/rail work; turn advancement
remains deferred. Priorities: fixed native naval attacks, checked commander rail travel.
- Checkpoint `Sidkick_Playground_BeforeNavalAttackRail_T62_1793967011654` confirmed
  RESULT_OK, no overwrite; prior checkpoints preserved.
- Added naval_attack_civ7_unit using fixed native UNITOPERATION_NAVAL_ATTACK, not
  generic ranged fire. Requires ready unpacked unqueued nonreinforcing naval combat
  ship on water, one exact visible hostile naval combat ship on an own/unowned
  non-district water tile, existing met war and exact native offered/selected checks.
  Native naval picker uses its offered Plots, not generic ranged Modifiers. Existing
  melee/ranged wrappers remain unchanged. No land targets, shore bombardment,
  civilians, stacks, districts, cities, foreign territory, wars or turn advancement.
- Positive naval fire remains fixture-only. Existing Dreadnought3407900 at `(32,14)`
  had movement privately restored (attack1 unchanged); native NAVAL_ATTACK still
  returned Success=false/no plots. Actual MCP rejected a deliberately selected land
  target before request; this is a live guard only, not firing coverage.
- 184 Python + 342 Node tests pass; default23 read-only tools unchanged, write
  mode67 tools including44 actions.
- Separate rail setup: normally purchased commander4128776 in St. Petersburg
  `(19,9)` with exact native2000Gold quote/cap, purchase verified and queue preserved.
  Gold4731.33984375→2731.33984375. Copan native purchase quote was blocked because
  its per-turn purchase was already used; no request submitted there. Stations in Copan,
  Bàakʼ and St. Petersburg; no station purchase/debug construction was necessary.
- Native naval attack batch committed as `83816ba`.
- Added rail_civ7_commander over fixed MOVE_BY_RAIL, not ordinary movement or an
  inferred rail path. Land commander only, known captured packed membership,
  mobile unqueued unembarked source, visible owned land endpoints, empty exact
  destination and native offered/selected checks. Readback requires exact arrival,
  preserved members and queue0. No station purchases, unpacking, foreign/fogged
  destinations, ordinary-unit/naval/air rail or future-turn orders. Selected land
  commander logistics exposes exact checked rail options.
- Commander4128776 approached the actual St. Petersburg rail station by checked
  ordinary movement `(19,9) → (20,10) → (19,11)`. Native rail was unavailable at
  city centre but offered Bàakʼ/Copan station plots once on the station with movement.
  Actual MCP empty rail `(19,11) → (13,4)` verified; no path guessed.
- Existing Rifleman2490373 explicitly moved `(15,6) → (14,6) → (13,5)` by checked
  unit steps and joined only the separate rail test commander. Actual MCP packed
  rail `(13,4) → (26,11)` verified exact Rifleman membership and clear queue.
  Movement privately restored for the separated cases and Rifleman positioning;
  synthetic readiness, no attack/debug-tech grants or turn advancement.
- 184 Python + 345 Node tests pass. Default23 read-only tools unchanged; write
  mode68 tools including45 actions. New commander remains at Copan station with
  Rifleman2490373 packed. Original land armies and fleet membership unchanged.
- Native save `Sidkick_Playground_AfterNavalAttackRail_T62_1793967597361` confirmed
  RESULT_OK/no overwrite. T62 active/sent=false; Gold2731.33984375 after the one
  normal2000Gold commander purchase; original Merchant `(18,20)`/HP100 unchanged.
- Rail batch committed as `c7cb56d`.
- Revisited group-upgrade eligibility using actual fleet members: each of the three
  existing Frigates quoted direct Dreadnought/200Gold while deployed. Exact typed
  joins of1703961/1769498/1835035 into Fleet Commander131073 made native UPGRADE_ARMY
  eligible with `Upgrade 3 units: 600 [icon:YIELD_GOLD] Gold`. The former pending
  case was an empty/no-eligible-member fleet, not a missing game capability.
- Added upgrade_civ7_army with exact commander, finite Gold cap and fresh turn;
  requires every one of1..16 packed land/naval combat members to have a complete
  native direct-target/price quote. Strict observed English group count/Gold text
  must reconcile with all member quotes. No guessed costs, mixed eligibility,
  subset selection, queued member, implicit unpack or turn advancement. Fresh full
  owned inventory/membership/quotes/balance must agree before one submission.
- Readback proves all member types within the same army (including replacement
  IDs), exact Gold spend, all unaffected unit identities/types and other armies
  preserved. Duplicate-type replacements are verified as a multiset, not falsely
  paired to each original unit. Selected commander logistics exposes the native
  aggregate count/Gold quote; per-member reconciliation remains action-specific.
- Actual MCP cap599 rejected without request; cap600 verified three Frigates →
  three Dreadnoughts. New IDs4194311/4259882/4325419 remain packed in commander131073
  at `(46,30)`, HP100 each; original Frigate IDs disappeared. Gold2731.33984375→
  2131.33984375. Other unit identities/types and three other armies preserved.
  Eligibility setup used restored movement only, not free upgrades/debug tech.
- 187 Python + 351 Node tests pass; default23 read-only tools, write mode69 tools
  including46 actions. Native save
  `Sidkick_Playground_AfterGroupUpgrade_T62_1793968151444` confirmed RESULT_OK/no
  overwrite. Still T62 active/sent=false, every commander queue0, original Merchant
  `(18,20)`/HP100 unchanged. Land group upgrades and mixed-type replacements remain
  fixture-only; mixed upgradeable/non-upgradeable armies are deliberately unsupported.

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
