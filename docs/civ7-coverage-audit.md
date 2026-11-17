# Civ VII coverage and verification limits

Reconciled against current source/registrations **2026-11-17**. The default
server has **31 game-read-only tools**; stdio write mode adds **129 actions**
(160 total). Registration is not live certification, and annotations are not
authorization controls. Exact contracts live in [read reference](reference/read-tools.md),
[action guide](actions.md) and current MCP schemas.

## Implemented surface

| Area | Available now | Important boundary |
| --- | --- | --- |
| Empire/economy | Current identity/ability definitions, owned settlements/yields, growth, placements, resources, factories/trade, limited card estimates | No general marginal-yield/policy/focus/GDP simulator; definitions are not evaluated effects |
| Choices/culture | Research, cards, government/celebration, attributes including repeat purchases, religion, Syncretism, narrative/review handlers, work movement/archive | Each picker needs actual eligibility; exchanges/replacements can be non-atomic; rewards not fully inventoried |
| Units/world | Owned inventory, ordinary fog-capable movement, Scout automation, strict travel, logistics/rail/air/commander tools, bounded ASCII/SVG maps | No hidden-world scan, guaranteed safe route/future arrival, or all-unit destination matrix |
| Warfare | Typed individual/group land/naval/air attacks, pillage/raids/plunder, bounded health/native-kill observation, empty-centre assault/keep/raze-start | No numerical damage predictor, arbitrary stacked/civilian targets, complete hidden/global-effect accounting or WMD writer |
| Diplomacy | Known wars/opponents, cooperative/hostile/secondary projects and responses, befriending/support/levy/bonuses, alliances, declarations and peace drafts/search | Partial offers/secondary choices; working negotiation is not verified enacted-item history; peace INSPECT changes draft/native state |
| Turns/boundaries | Guarded ordinary turn, separate transition phases, civilization/Mementos/Dedications/effects/capital, local save/load/ordinary Begin | No forced blockers, full retention simulator, generic popup handling or proven unattended whole-campaign controller |
| Public rules/victory | Loaded Civilopedia, scoreboard/countdowns/schedules, conditional Culture evidence, Military screen settlement classifications, Modern project requirements | No universal rule evaluator, exact Culture attribution/activation or fastest-win forecast |

Snapshots retain explicit failure/consistency status and remain non-atomic.
Explicit-file exports support any complete loaded save without overwriting;
legacy no-argument Catherine filenames still replace their matching export.

## Visibility exceptions are explicit

Known-world settlement metadata requires currently visible met-owner centres;
threats require current sight; hidden/unmet diplomatic details are withheld.
Two **public-screen** exceptions must not be confused with private-world access:

- Unmet majors retain anonymous public victory totals/countdowns, not identities,
  history or prerequisite details.
- Military settlement summaries use the screen's local/met scoring ledger,
  including named fogged settlements and City/Town/capital classification. They
  do not reveal foreign private queues, yields, population or locations, nor
  establish an independently complete empire census.

## Evidence status

The [historical logs](history/README.md) preserve exact test snapshots, late/unknown
outcomes, native checkpoints and synthetic setup. Do not reuse their old counts
as current suite totals or their last campaign position as live state.

- Many original research, policy, production/purchase, growth/resource, work,
  diplomacy, movement/logistics and combat actions have recorded positive native
  effects. **Several used debug-created prerequisites** (units, XP, movement,
  damage or balances); that is not naturally earned eligibility.
- A clean **Nov 11 Exploration T125 → Modern T1 Prussia** transition used production
  handlers, without debug progression, and verified the phase workflow, selected
  effects and completion. Alternate transitions, placement effects and unused-point
  confirmation remain fixture-only. See [transitions](transitions.md).
- Newer peace combination search/negotiation has source-backed positive fixtures;
  the Nov 16 live read had no met war. No positive live draft edits, INSPECT,
  search, final proposal/response or settlement transfer were established there.
- Repeat attribute purchases, Syncretism selection, capped repair purchases,
  befriending-support increments, paid Call to Arms neutrality, ordinary Begin and
  reusable save/load writes have fixture coverage but no positive live execution
  recorded by their implementation notes. Read-only eligibility is not execution.
- Later movement/Send Merchant/first-meet-modifier and native permission-shape
  fixes retain their own fixture-versus-live qualifications. Historical successes
  for narrower versions do not certify every newly allowed branch.
- Linux tunnel wrappers are fake-client tested; the full official-client lifecycle
  and actual ChatGPT path remain deferred in [TODO](todo.md).
- The live smoke script also needs map x/y selector handling before a full current
  31-reader pass is possible; see [development checks](development.md#optional-live-read-only-smoke-check).
  Offline registration/catalog checks do not claim a fresh live pass.

## Remaining limits

- Culture: no verified pure runtime tracker-activation/marginal-Tourism getter,
  uniform exact-rule ledger discriminator or general Airfield/rail scope evaluator.
  Candidates, mastery and matching historical awards do not fill those gaps.
- Missing enactment schemas, safe per-item identities and unsupported native
  operations cannot be replaced with guessed selectors or permissive `canStart`.
  Great Work concessions, Force March and legacy physical-route pillage remain
  unsupported as described in the [backlog](civ7-action-backlog.md).
- Treasure Convoy cargo/generation timers, full crisis/DLC/mod compatibility,
  complete reward/conquest/retention effects and long-horizon automation are not
  certified. Positive cases remain prerequisite-dependent in several families.
- The historical **60→62** ordinary-turn observation remains unexplained. The
  adapter did not automatically retry it; later boundary work is not proof the
  anomaly's cause was resolved.

For remaining tasks, see the [current backlog](civ7-action-backlog.md). For the
original six-increment read-only audit and source evidence, see its
[archived record](history/read-only-coverage-audit.md).
