# Live turn flow

## User preference

Keep turns flowing without making the user repeatedly ask which units need
orders, what remains to do, or whether it is time to pass. Automatically provide
a concise new-turn briefing after an authorized turn advance, and a remaining-task
checklist after each approved action batch. This is a reporting preference, not
permission to play extra turns or take unapproved actions.

## After an authorized turn advance

1. Verify the resulting turn, Age and local player. Stop if the context changed
   unexpectedly; do not silently submit another turn.
2. Refresh turn context, units, city production decisions and active research.
   Use focused follow-up reads for pending choices, growth, diplomacy, threats,
   discoveries or other changes that affect this turn. Compare domain turns;
   failed/missing evidence is unknown, not an empty task list.
3. Compare important travelling units with their last observed positions. Report
   whether they actually progressed, especially a Settler or an Ocean crossing.
4. Brief the user without waiting for another question:
   - **What changed:** completions, discoveries, health loss, disasters or deadlines.
   - **Required decisions:** name the city, research or pending choice and recommend
     a concrete action. If none are reported, say so.
   - **Unit checklist:** identify each relevant unit by role/type, coordinates or
     landmark (and instance ID if needed to distinguish duplicates), movement,
     material health concerns, and its recommended next action.
   - **Readiness:** use the labels below and list everything still outstanding.

Do not merely say "unit orders remain." Separate units needing manual orders,
units with observed queued travel, Scouts on native Auto-explore, and units whose
standing defensive orders need no change. Unspent movement alone does not mean
a unit needs a new order. A generic native command-units notification does not
identify its exact blocking units; distinguish that notification from the
assistant's recommended unit tasks.

## Execute approved batches, then close the loop

- State a concrete bounded batch for approval. Once approved, perform and verify
  it without asking again for the same action unless the target, risk or scope
  materially changes. An instruction to move toward a site is not permission to
  found there; exploration is not permission to advance turns or start a war.
- Refresh the minimum relevant evidence before writes. Do not duplicate an
  existing move or automatically retry an unknown/cancelled result.
- After the batch, report actual positions, health/movement changes and observed
  queues, then list remaining tasks and readiness automatically. Include any
  unfinished part of the approved batch and explain why it stopped.
- Preserve the user's current game; a mistaken route is not permission to reload
  a save. Confirm intended landmarks before issuing a corrected destination.

## Queued movement is not guaranteed arrival

- Distinguish **arrived**, **moved partway**, **MOVE_TO observed/queued**, and
  **Scout Auto-explore active**. A successful submission is not verified arrival.
- If exact queued destinations or current activity are unavailable, say so. Do
  not claim that unit inventory or a destination permission/path preview exposes
  the stored order. Label older queue observations as historical.
- Do not promise that ending the turn will move a unit. Check position changes
  after the next authorized advance; report stalled travel rather than silently
  resubmitting. Request clarification or a UI check if read-only tools cannot
  resolve the order state. Never issue a move just to inspect its queue.
- Native path turn labels are not a guaranteed arrival countdown. Ocean damage
  already observed is not proof of a fixed future attrition rate.

## Readiness labels

- **READY:** no native blockers or unresolved recommended tasks remain. Mention
  nonblocking watch items, including uncertain queued continuation, explicitly.
- **NOT READY:** list native blockers and/or recommended manual actions still
  outstanding, distinguishing mandatory choices from optional exploration.
- **UNCERTAIN:** missing evidence prevents a reliable readiness assessment; name
  the missing check. Do not turn an unavailable queue getter into an endless
  blocker or repeatedly query the same unsupported field.

No native blockers means the game permits passing, not that every useful action
is finished. Conversely, defensive units with movement do not require arbitrary
moves. End with a clear verdict, for example:

> **Tn — NOT READY.** Required choices: none. Recommended actions remaining:
> western Cog coastal exploration; home Scout toward the settlement area.
> Settler: last observed MOVE_TO queued; destination unverified, check progress
> after the next authorized advance. Defensive units: leave standing orders.
> No turn advanced.

Only advance when the user explicitly authorizes it, or within an explicitly
delegated bounded gameplay scope. Readiness and this document grant no additional
action authority. Keep volatile campaign positions in a requested handoff, not
as permanent instructions here.
