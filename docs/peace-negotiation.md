# Peace negotiation and search

This is a **working-draft** interface, not a verified inventory of enacted deal
items. Reads are available by default; edits, native inspection, search and
submission require [stdio write mode and user authorization](actions.md).

## Read the actual draft

`get_civ7_peace_negotiation(target_player_id, direction="outgoing")` returns
`youGive`/`youReceive`, exact items, offered terms with `itemToken`/`available`,
a fresh whole-draft `dealToken` and completeness flags. It never initializes or
clears a draft or sends native INSPECT.

The native UI converts incoming offers to **outgoing working drafts**.
`pendingDeal=false` is not proof there is no open negotiation; use `incoming`
only for an offer still in that direction. Open the native peace screen if the
reader reports no working draft, or use the explicit guarded prepare action
when authorized and eligible.

Unknown/unsupported/hidden selected terms disable the whole-draft token. Foreign
city metadata is limited to currently visible centres of the met counterpart;
owned cities remain available. `offersComplete=false` means partial evidence,
not proof that omitted cities are unavailable.

## Separate edits from submission

`manage_civ7_peace_deal` accepts the fresh `deal_token`, `expected_turn`, exact
counterpart/direction and operation:

| Operation | Purpose |
| --- | --- |
| `prepare` | Initialize an empty draft, not discard existing work |
| `add` | Add one exact offered `item_token` |
| `remove` | Remove one current concession `item_id` |
| `inspect` | Send native asynchronous acceptance preview |
| `propose` | Propose/counteroffer the exact bound draft |
| `accept` / `reject` | Respond only with proven incoming context |
| `restore` | Explicit interrupted-search recovery using current token/caps |

Supported concessions include multiple exact settlement terms and at most one
Gold lump and one Influence lump across both sides, matching the native UI.
Cities retain owner-qualified identity and distinguish transfer from ceding
occupation. Gross local obligations must fit explicit `max_gold_cost` and
`max_influence_cost` (default zero) and current balances. Last-owned-settlement
guards apply. Edited incoming terms cannot be silently accepted; native
counteroffers use ADJUSTED.

Native INSPECT is **not a read-only getter**. The reader reports `acceptance=null`
unless a recent inspection matches the unchanged draft/context. A preview is
not actual peace or a future acceptance guarantee. Avoid concurrent UI edits or
inspections: native response events do not echo a caller request ID.

Tool edits can leave an open native panel's displayed item IDs/terms stale.
Do not click those old controls. There is no automatic panel refresh/closure;
the native new-deal population path clears the draft.

## Bounded combination search

`search_civ7_peace_deals` takes fresh draft/turn, up to **32 explicitly selected
available candidate tokens**, spending caps, `offset` and `limit` (1–32,
default 16). Each currency has none/one choice; cities are independent choices.
It mutates the working draft and sends **INSPECT only**—never proposes, accepts,
rejects, chooses a final deal or advances a turn.

Results include exact batch coverage, cap/last-city exclusions, accepted/rejected
previews, `nextOffset` and the batch's non-dominated accepted `frontier`.
Gold, Influence and each named city remain separate dimensions: no invented
exchange rate or interchangeable city-count score. Reuse candidate order and
the freshly returned draft token across offsets; combine batches before claiming
an overall best deal. Partial offers also limit any completeness claim.

Search normally restores original **terms**, not old native item IDs, old tokens
or an acceptance banner. On timeout/disconnect/cancellation, it must not race a
possibly late native action with more writes. Read `searchRecovery`, inspect the
current draft, then authorize `restore` explicitly if appropriate. Recovery lives
in game-context memory, not a save file. No unconditional rollback or retry.

Acceptance verification requires actual bilateral peace, agreed own currency
deltas, exact settlement recipients and preserved unrelated owned cities.
Buildings, Great Works, units and global diplomatic cascades are not fully
inventoried. Narrower white-peace, economic-concession and single-city tools
remain available; see the [catalog](reference/action-tools.md#diplomacy-and-peace).

**Evidence:** native-source fixtures cover positive negotiation/search/restoration
and transfer guards. The Nov 16 live read had no met-major war and exercised an
empty non-peace draft only. Positive live search/edit/submission remains unverified;
no war/save load was manufactured for that implementation.
