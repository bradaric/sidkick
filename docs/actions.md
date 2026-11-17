# Opt-in action guide

Sidkick is read-only by default. Start a deliberately write-enabled local server:

```sh
civ7/.venv/bin/python -m sidkick.server --transport stdio --enable-writes
```

This registers **129 actions alongside 31 readers (160 total)**. HTTP write mode
is refused; supplied ChatGPT bridge commands stay read-only. Configuration and
MCP annotations are not user authorization or an access-control boundary.

Use the [action catalog](reference/action-tools.md) to find a tool, then discover
its **current schema and description** for exact arguments, caps and limitations.
Examples below explain workflows; they are not permission to act.

## Shared contract

1. Obtain an exact user action instruction or explicit bounded single-player
   sandbox delegation. Preserve unrelated saves and user checkpoints.
2. Read fresh evidence for the relevant domain. Use native IDs, owner-qualified
   component identities, offered choices and current turn/tokens—not guessed
   hashes, names substituted for IDs, or list positions.
3. Respect active-player, loading, pending-phase, visibility and native permission
   checks. Normal gameplay requires GameStarted; dedicated loading/transition
   paths are separate. Missing eligibility or cost is not permission or zero cost.
4. Supply explicit spending caps where required. Quotes are rechecked but not an
   atomic guarantee against another writer or simultaneous UI changes.
5. Inspect the action-specific readback and stop on uncertainty.

Actions share a process-local lock through bounded readback. **Use only one
write-enabled server for a game**, and avoid simultaneous manual edits. There is
no cross-process deduplication, exactly-once guarantee or general rollback.
Individual native submissions are not automatically retried. Composite workflows
such as peace search/restore and espionage-report acknowledgement deliberately
perform several distinct steps; they are not atomic single native requests.

## Outcomes

| Result | Interpretation |
| --- | --- |
| `rejected` | A guard/native check refused the action; inspect its reason and `rejectionSource` where provided |
| `already_active` / other `already_*` | Tool-specific no-op; no new action was needed |
| `submitted` | A request/order was observed, not necessarily its final effect |
| `verified_partial` | The stated partial effect was observed; final destination/result is unproven |
| `verified_applied` | The tool's specific postcondition was observed, not every possible secondary effect |
| `blocked` | A turn/boundary request returned to known unresolved tasks; inspect and resolve them explicitly |
| `unknown` / cancellation / disconnect | The action may already have happened; **read current state, never automatically repeat it** |

Most ordinary actions use up to two seconds of read-only verification; many
movement/combat/UI workflows use 15 seconds, and turn/Age boundaries up to 60.
These bounds are not proof an operation cannot apply later. Same-turn state
changes or matching-marker save switches are not atomically excluded.

## Research, cards and choices

- Select research using `technology.available[].id` or `civic.available[].id`
  from `get_civ7_research_and_government`, with its turn as `expected_turn`.
  Each action chooses one offered node, not a long-term target. Existing long-term
  targets must be cleared in-game; the tool will not silently clear them.
- `set_civ7_policy_active` handles ordinary policies only.
  `set_civ7_culture_card` explicitly names `policy`, `tradition` or `crisis`.
  Activation needs an eligible empty slot and native swap permission. An ordinary
  card can use a tradition slot only when ordinary slots are full. Remove/add
  replacements are separate, **non-atomic** calls, not automatic migrations.
- Review tools acknowledge specific resource/policy reminders; they do not choose
  assignments/cards or bypass other blockers.
- Government selection needs a real pending picker/no-government state; generic
  native permission alone does not authorize a mid-Age switch.
- Celebration selection accepts a genuine live local chooser notification or
  native `Happiness.canChoose`, plus an exact offered native-permitted choice.
  A default active celebration does not prove the prompt is resolved.
- Attribute buying supports one repeatable purchase per call. Base definition
  funding is not an exact repeat-purchase quote; readback checks unlock/repeat depth.
- Ordinary narrative choices are zero-cost/non-trial. The extended tool requires
  explicit trial acknowledgement and actual known runtime currency/cost within
  caps for paid choices; definition costs are not substitutes.
- Syncretism requires the offered signed **trait** `choiceId`, not a civilization
  hash. Unit rewards/replacement warnings require explicit replacement acknowledgement;
  readback proves selection, not complete replacement/yield accounting.

## Settlements, resources and works

- `append_civ7_city_production` preserves the old queue and adds one tail.
  `purchase_civ7_city_item` buys a unit/building under a Gold cap. Ordinary building
  paths require explicit legal no-overbuild placement; units/projects omit x/y.
- Advanced construction separately declares Wonder/repair/overbuild/improvement
  intent with a fresh placement token. Acknowledging rural replacement can also
  be required for ordinary-building overbuilds. Only explicitly offered native
  expansion tiles may be unassigned/unowned. Appending is not completing/purchasing.
- `purchase_civ7_repair` is a distinct capped purchase of the **same damaged
  completed instance**. It verifies restored condition and preserved queue/tile
  ledger; Gold loss alone does not prove a repair.
- Queue edits cancel one order or swap adjacent indices with a whole-queue token.
  Refunds and invested-progress retention are not promised.
- Population consumes a ready pending placement using a legal growth option, not
  a general improvement preview. Specialists have separate slot/capacity/upkeep checks.
  Town-to-city upgrades spend Gold and may create follow-up population decisions.
- Resource identity is `(resource_instance, off_map)`. Assignment, unassignment,
  atomic native swap and factory Clear are separate tools. Clear/reassignment is
  non-atomic; do not silently replace a producing factory specialization.
- Work moves require exact owned instance indices and compatible free undamaged
  slots. Archive is separately supported. Exchanges can use explicit archive/move
  stages; no atomic occupied-slot swap or marginal yield forecast is promised.

## Movement, orders and trade

**Normal movement:** `move_civ7_unit` uses native fog-capable MOVE_TO without
ATTACK or the UI's broader attack/swap/war helper. Distant/fogged targets, native
shore/peaceful access, replacement move orders and zero-movement queuing are
allowed when natively legal. Visible combat/impassable targets and required
war/confirmation reject; hidden terrain/occupants are not inspected.

Readback distinguishes `arrived`, `moved_partway` and `move_order_observed`.
The last means a MOVE_TO is active/queued, **not verified exact queued target or
future arrival** (`queuedTargetVerified: false`). Do not resubmit a queued move.
Danger, attrition, stopping short and later continuation remain possible.

`travel_civ7_unit` is an optional strict 1–8-edge visible/empty current-turn mode,
not the default exploration tool. Its strict embarked/water source assumption
still limits navigable-river cases. Use normal movement for those.

Commanders use separate bounded movement with full packed-membership verification.
Authorization covers the commander **and every carried member**. Native river
embarkation is not inferred from `isWater`; adjacent river/shore changes use the
explicit crossing tool. Rail, air, reinforcement and pack/deploy are distinct
contracts; an assignment/ETA is not reinforcement arrival. Pack-nearby lets the
engine select eligible units, potentially civilians; use individual join/leave
when exact membership selection matters.

Unit orders include skip/sleep/wake/fortify/heal/alert/cancel and **Scout-only
auto_explore**. Heal verifies an order, not restored HP. Native Scout automation
may move immediately and on later authorized turns; it is not empire automation.
Use cancel/wake to stop it.

Merchant route tools bind exact route `targetPlayerId`/`targetCityId` (IDs can
repeat across owners). Establishment may instead perform native **Send Merchant**:
one move toward the destination, never a move plus immediate follow-up establishment.
Only `route_established` proves an active route; dispatch/queued movement does not.

## Combat, diplomacy and turns

Combat tools are deliberately separate by unit role, terrain ownership, target
kind and individual/group mission. Use fresh combat options and the exact writer's
contract. A field attack is not a city assault; capture is not automatic keep/raze.
Native group commands may consume multiple participants' attacks. Siege-only
Katyusha units are not land Focus Fire's `UNIT_CLASS_RANGED` participants.

There is no numerical damage/outcome simulator. Bounded visible health/native
kill-event observation is not full interception, splash, hidden or global-effect
accounting. Target departure alone is not proof of a kill.

Diplomacy starts, responses, support, withdrawal, alliances, declarations and
[peace negotiations](peace-negotiation.md) have separate identities, caps and
phase guards. Starting a project does not prove future completion/suzerainty.

`end_civ7_turn` submits one ordinary turn, never skips choices/units, and verifies
exactly the next active local turn in the same Age/player context. Unit blocking
follows the native cycling preference; unspent movement alone is not a blocker.
Age boundaries use the [transition workflow](transitions.md), not forced end-turn.
The historical 60→62 anomaly remains unexplained; fixture coverage is not a claim
of reliable unattended whole-campaign play.
