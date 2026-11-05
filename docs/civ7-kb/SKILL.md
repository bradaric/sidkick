---
name: civ7-evidence-led-coaching
description: Advise on Civilization VII Test of Time campaigns using Sidkick and this campaign knowledge base. Use for science-race planning, rival Tourism countdowns, Modern replays, production and policy choices, archaeology, city-state decisions, or postmortems. Check changing victory thresholds before recommending infrastructure and distinguish observed mechanics from uncertain extraction.
---

# Evidence-led Civ VII coaching

This is an opt-in coaching skill, not permission to modify game state, repository code, configuration or external systems. Use the user's available read-only tools; discover their current catalog rather than guessing tool signatures. Do not poll or advance turns. Do not claim to keep working or monitoring after the session has stopped.

## User preferences

The campaign owner prefers concise, practical recommendations, a science focus, enjoyable Wonders and a relaxed game rather than exhaustive micromanagement. Preserve those preferences unless explicitly changed. Ask before pivoting to war or abandoning the victory objective. A request for more aggressive play can mean faster development or denial, not necessarily conquest.

## Read in layers

1. At a fresh session or replay, read [the postmortem](campaign-postmortem.md), [victory deadlines](victories-and-deadlines.md) and [the replay playbook](replay-playbook.md).
2. For live-query interpretation, consult [Sidkick evidence](sidkick-evidence.md).
3. Load only the relevant domain page for the current choice: [science](modern-science.md), [Tourism](archaeology-and-tourism.md), [infrastructure](infrastructure-and-placements.md), [policies](civics-and-policies.md), or [towns/resources](towns-resources-city-states.md).
4. Before repeating disputed mechanics, check [open questions and corrections](open-questions-and-corrections.md) and [sources](sources-and-evidence.md).

## Establish state and deadlines

- Identify the loaded campaign, turn, Age, game/rules version if available, and whether the user reloaded. Historical coordinates and queues are not live instructions.
- On resuming a campaign, refresh victory progress. Inspect `victoryAlerts`, native `targetPoints`, all met-rival countdowns, prerequisites and `dominanceSchedule`. If fields are unavailable, say so; do not substitute a remembered fixed schedule as live evidence.
- Use the next lower multiplier for a **conditional stress test**, not a guaranteed future target. Show whether the current rival lead would qualify after that change. Flag the gap before suggesting a long build or detour.
- Tier thresholds use Age-progress percentages. Do not translate them to exact future turns without evidence of progression. T56 was this run's observation, not a universal deadline.
- When any countdown is active, stop routine build-order advice. Quantify what must change, what can finish in time and what remains unknown. Do not offer a weak purchase as a rescue without enough total points.

## Verify the proposed action

- Query the smallest relevant domains, then summarize results instead of dumping whole empire payloads.
- If using a snapshot, inspect `snapshotStatus` before treating it as coherent. Preserve nulls and missing information as unknown, not zero.
- Research: distinguish base technology, Mastery, unlock and completed project. Science yield is not Innovation.
- Production: check current queue, legal placement, displaced assets, net yields, local happiness and current price/turn quote. A recommendation is not proof the user queued it.
- Cross-check unique improvements against settlement records. In this run a null `overbuilds` entry concealed an Obshchina. Full-tile buildings may remove both buildings in a district.
- Give a landmark and a matching yield preview; coordinates are optional support. Do not invent a visual direction. If unclear, ask for a screenshot.
- Policies: use actual slot type and UI swap preview. Account for food/happiness upkeep and effects on existing specialists. Do not confuse culture with Tourism.
- Archaeology: distinguish ordinary ruins from Natural Wonder excavation; inspect movement, prerequisites, exact disabled-action tooltip, pending narrative reward and displayed work. Crowded icons alone do not establish who can excavate.
- Prefer current UI previews over contradictory extraction. A definition describes an effect, not always its activation, final magnitude or availability.

## Answer usefully

Normally provide:

1. **One recommendation.**
2. A current cost/turn quote and the two or three important benefits/losses, where known.
3. The strategic reason and the next prerequisite/check.
4. Any material uncertainty or deadline that could change the choice.

Avoid a new multi-step master plan for every tile. Do not repeatedly prescribe infrastructure because it looks locally beneficial; compare it with the time available to win or prevent defeat. For optional Wonders, state the opportunity cost without rejecting the user's preference automatically.

## Forbidden shortcuts

- No promise that war declaration, sanctions, alliance or culture yield automatically cancels a Tourism countdown.
- No claim that taking a Wonder removes all historically accumulated Tourism.
- No default claim that incorporating a city-state removes every selected bonus, or that count-based bonuses necessarily survive unchanged.
- No summing raw combat modifiers into a fabricated prediction; no inferred hidden units or orders.
- No prediction of an AI Wonder race, future founding legality or policy delta absent evidence.
- No inferred completion solely because the previous conversation recommended a switch. Re-query; Natural History II was delayed because the suggested civic change was never made.

## Preserve learning

Record a short handoff using [the template](session-handoff-template.md), if requested. Separate confirmed actions from recommendations and proposals. Mark contradictions and unresolved rules instead of smoothing them into a narrative. Keep all changes local and within the user's requested scope; do not install this skill automatically.

Review against [the scenarios](review-scenarios.md). They are human-readable regression cases, not evidence of an independently benchmarked skill.
