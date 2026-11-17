# Saves, loading and Age transitions

Use the [action safety contract](actions.md). These workflows can replace a
session or irreversibly migrate a campaign; read-only readiness is not consent.

## Ordinary save and load

1. `get_civ7_saved_games(limit=50, offset=0)` lists bounded local manual/quick/auto
   single-player game-state metadata from a stable game or menu. Its `saveToken`
   binds exact file identity/revision, **not saved world state**. Cloud, multiplayer,
   live-event, configuration and Age-transition saves are excluded; required
   missing/unowned content blocks loading.
2. `save_civ7_game(save_name, expected_turn)` creates a **new local manual save**
   during an active single-player GameStarted turn. Names are 1–80 ASCII letters,
   digits, spaces, underscores or hyphens, with no paths/extensions, edge spaces
   or reserved device names. Existing names reject; native Overwrite is false.
   Success needs serializer confirmation and exact file turn/Age metadata, not
   merely native acceptance.
3. `load_civ7_game(save_token, confirm_discard_unsaved_progress=true, expected_turn=...)`
   **discards unsaved progress**. Obtain exact user authorization, then a fresh
   browser token. Supply the current turn in GameStarted; omit it only at the
   main menu. Stale/ambiguous/ineligible saves reject. The boolean is not consent.
4. `status=submitted, loadCompleted=false` is acceptance, not finished loading.
   Read `get_civ7_loading_state`; when the ordinary Begin is visible, enabled and
   unobstructed, pass its fresh `loadingToken` to `begin_civ7_loaded_game` if
   authorized. It presses only native ordinary Begin, not Age Continue/welcome,
   and verifies started context with the startup curtain gone.
5. Refresh gameplay identity/evidence before acting. Started readiness is not
   proof a particular requested save was loaded.

These actions never delete/overwrite saves, sync to cloud or retry a timeout.
Read state after uncertainty; the operation may already have happened. Save
completion category checks tolerate non-category option bits (captured manual
success used options 65), not arbitrary quick/auto categories.

Browsing and ordinary Begin readiness have live-read evidence. Reusable save/load,
menu and ordinary-Begin writes remain fixture-tested, not positively live-certified
by that implementation. Historical private native checkpoints are separate evidence.

## Planning versus execution

`get_civ7_age_transition` is the profile-free planning read, also in snapshots:

- Next-Age transition civilization selector plus native unlock paths/progress.
  `setupValid` alone is not unlocked; `eligibleByChecks` is not an open picker.
- Current and prospective Memento slots separately. Definition/domain membership
  is not verified profile unlock/equip permission.
- The **current** native Dedication deck, explicit deck Age, costs/limits and
  a fresh `deckToken`. `nextAgeChoices` remains unknown.
- Source-inspected, game-speed-adjusted ORIGINAL/KEEP_MORE balance-cap estimates,
  not a full retention/reset forecast.

`get_civ7_transition_workflow` is the focused execution read. While civilization
selection is pending it intentionally reads native Memento/slot **profile metadata**
(without instantiating the UI model or marking items seen). Missing locks/metadata
fail closed. This is distinct from the profile-free broad planning snapshot.

## Execute one phase at a time

Refresh the workflow after each action. Most execution actions bind its fresh
`workflowToken` as `workflow_token` and `expected_turn`; the civilization selector
uses the planning read's `selection_token`, deck editing uses `deck_token`, and
loading uses `loading_token`. Discover exact schemas rather than interchanging tokens.

| Action | Scope |
| --- | --- |
| `open_civ7_transition` | Activate the exact pending civilization notification |
| `select_civ7_transition_civilization` | Set only the transition-specific civilization parameter; verify pending selection, not transition completion |
| `select_civ7_transition_memento` | One eligible slot/Memento or NONE; clear a duplicate's old slot explicitly |
| `confirm_civ7_transition_choices` | With `confirm=true`, send only native Finished; not necessarily loading |
| `view_civ7_transition_map` | Close the chooser via View Map without confirming or applying effects |
| `advance_civ7_age_transition` | With `confirm=true`, submit once at a guarded non-final/non-extended Age boundary |
| `begin_civ7_transition_age` | One exact loading Continue **or** separate in-game Age-welcome Begin; refresh between them |
| `edit_civ7_dedication` | Add/remove one current-deck card under a point cap; no effects/finalization |
| `apply_civ7_dedication_effect` | Consume one selected non-placement effect |
| `place_civ7_dedication_effect` | One selected placement effect at explicit revealed native-legal coordinates |
| `select_civ7_transition_capital` | One exact owned candidate, Swap=false; no name swap/renaming |
| `complete_civ7_dedications` | Confirm resolved effects/capital and native completion; unused points need explicit acceptance |

There are **two confirmations**: civilization/Mementos before loading, then
Dedications/capital afterward. Closing the Dedication screen via View Map is
required before individual effects/capital/completion: its native listener can
otherwise send further effects automatically.

`getDeckSize()` is **selected-card count, not capacity**. `openSlotCount` is unknown
while open; `full_unconfirmed` means no currently eligible additions, not a fixed
number of full slots. A completed deck is never reopened.

## Recovery and completion

- Finished can leave a civilization notification present but **nonblocking**:
  `choices_acknowledged`, not another selection. Follow `nextAction` and
  `requiresChooserClose`; do not repeat Finished.
- `confirmedLoadout` captures the expected arrival civilization/Mementos in the
  current UI runtime before submission. A reset native draft selector must not
  overwrite that receipt. If the receipt is missing, `requiresExpectedCivilization`
  requests an explicit eligible recovery expectation; it does not repair stored
  choices, override a captured target or authorize re-confirmation.
- Native `isAgeOver` may still be false at maximum progression. For acknowledged
  choices only, known completed progression can supply the boundary check. Unknown
  progression/flags, open chooser, unit/native blockers and ordinary turns reject.
  Newly revealed blockers return `blocked` with `nextAction: get_civ7_turn_context`;
  resolve them explicitly, never auto-skip or force another submission.
- Cross-Age observation is bounded to 60 seconds. Observed loading can return
  `submitted, loadingObserved=true, transitionCompleted=false`; refresh instead of
  treating it as completed or resubmitting. Ordinary Begin and unrelated popups
  are never handled by the transition loader.
- Effect getters can lag native `AdvancedStartEffectUsed`. Context-bound event
  receipts distinguish confirmed consumption from stale amounts. Submission
  alone is not consumption; never repeat a pending/unknown effect.
- `transitionCompleted=true` requires started, resolved arrival—not merely
  Continue-ready, Age welcome, or accepted confirmation. Finalization may reload,
  cap balances, regress settlements and apply irreversible effects.

**Live evidence (Nov 11):** a clean authorized Exploration T125 → Modern T1 Prussia
replay used production handlers and verified civilization/Mementos, boundary
reactivation/blockers, separate Continue/welcome, three Dedications, five effect
consumptions, capital selection and completion. No debug progression or manual
transition clicks were needed. Placement effects, unused-point confirmation and
alternate campaign/Age variants remain fixture-only. The separate result save
wrapper timed out; metadata was inspected, never retried or claimed load-tested.
See [historical details](history/readme-notes-2026-11-16.md#age-transition-execution-workflow).
