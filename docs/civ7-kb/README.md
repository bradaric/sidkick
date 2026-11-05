# Civ VII campaign knowledge base

Compiled **2026-11-05**, from the Catherine / Maya / Maya / Russia campaign discussed in this session. Ruleset: **Test of Time**. The installed game version, full mod list, difficulty and campaign settings were not archived here.

**The main lesson: evaluate safety at the next victory multiplier, not just the current target.** A strong science economy is not a winning strategy if a rival can finish before its investments pay off.

## Start here next time

1. Read [the postmortem](campaign-postmortem.md) and [victory deadlines](victories-and-deadlines.md).
2. Follow [the coaching skill](SKILL.md), then use [the replay playbook](replay-playbook.md). Project startup instructions direct the AI to read the skill for gameplay questions; outside this project, load it explicitly.
3. Refresh the actual loaded save. **Nothing in this directory is current game state.**
4. Before committing to long builds, inspect native countdowns and the campaign-specific dominance schedule.

Suggested opening prompt:

> Read docs/civ7-kb/SKILL.md and follow its referenced guidance. We are replaying the Modern T1 save, not continuing the conceded T56 run. Refresh the loaded save, identify the next dominance deadline, and advise on peaceful science versus earlier containment. Do not reuse old queues or assume the same outcome.

## Automatic project guidance

- [Root AGENTS.md](../../AGENTS.md) is the small startup entry point for OpenCode. It instructs the model to read this skill when answering Civ VII gameplay questions, not when developing Sidkick.
- [Root CLAUDE.md](../../CLAUDE.md) imports that same `AGENTS.md` for Claude Code, avoiding duplicated guidance. Claude models used inside OpenCode follow OpenCode's instruction loading instead.
- Only the small router is loaded as startup guidance. The skill and topic pages are read on demand; they are not all injected at startup or installed globally. This is model guidance, not an enforced hook guaranteeing a read.
- Start the tools in this repository or a child directory with normal project-instruction loading enabled. In Claude Code, use `/context all` or `/memory` to inspect loaded memory files. Existing settings that disable project instructions can prevent loading.

References: [OpenCode V2 instructions](https://opencode.ai/v2/docs/instructions) and [Claude Code memory/imports](https://code.claude.com/docs/en/memory). No global configuration, hooks or services are changed by this setup.

## Contents

| Document | Use it for |
|---|---|
| [SKILL.md](SKILL.md) | Portable AI coaching instructions, selected by project guidance for gameplay; load only relevant reference pages |
| [Campaign postmortem](campaign-postmortem.md) | What happened, dated score checkpoints, preferences and mistakes |
| [Victories and deadlines](victories-and-deadlines.md) | Ratios, countdowns, defensive Tourism arithmetic and emergency triage |
| [Modern science](modern-science.md) | Innovation versus science; technology/project prerequisites |
| [Archaeology and Tourism](archaeology-and-tourism.md) | Explorers, Natural Wonders, slots, rail, Aerodromes and Hermitage |
| [Infrastructure and placements](infrastructure-and-placements.md) | Overbuilding, Alchemy, production payback, upkeep and disasters |
| [Civics and policies](civics-and-policies.md) | Russia's Traditions, specialist cards, governments and slot checks |
| [Towns, resources and city-states](towns-resources-city-states.md) | Focus selection, trade, Factory resources and incorporation |
| [Sidkick evidence and limitations](sidkick-evidence.md) | Which tool to use, missing data, contradictions and new warning fields |
| [Replay playbook](replay-playbook.md) | A conditional restart strategy, not an untested fixed build order |
| [Open questions and corrections](open-questions-and-corrections.md) | Claims not to repeat as facts; targeted verification work |
| [Sources and evidence](sources-and-evidence.md) | Source hierarchy, official links, provenance and access failures |
| [Session handoff template](session-handoff-template.md) | A small, copyable record for the next campaign session |
| [Review scenarios](review-scenarios.md) | Manual regression scenarios for the coaching skill |

## Evidence labels

- **OFFICIAL:** stated in the linked publisher documentation. Check applicability to the installed ruleset.
- **OBSERVED:** tool output or user/UI evidence in this conversation, at the specified turn. Not a universal rule or a replayed experiment.
- **REPO:** behavior documented or implemented in this repository. Read-only query implementation is not proof that every game mechanic is correct.
- **INFERRED:** arithmetic or a strategic judgment derived from named assumptions.
- **UNVERIFIED:** a question, disputed claim or hypothesis; not a basis for irreversible advice.

An assistant's earlier assertion is **not** evidence merely because it appears in the chat. Important corrections are preserved explicitly. These are curated notes, not a verbatim transcript or a complete save archive.

## Scope and maintenance

This is a plain-Markdown KB, not an executable agent, a database, a mod or a background monitor. `SKILL.md` has portable skill metadata but is **not installed or registered as a host skill**; the project entry points above instruct the AI to read it for gameplay. Keep this directory together if importing it into a compatible skill system; relative references need the other files. Host-specific installation should be a separate user-approved change.

The KB lives in `docs/civ7-kb/`, with only `AGENTS.md` and `CLAUDE.md` added at the root for startup guidance. No application code, service configuration or pre-existing documentation was changed for this KB. Keep future edits similarly scoped when another agent is working in the repository. Leave changes unstaged/uncommitted unless requested otherwise.

To update a fact, record the turn/Age, ruleset, evidence type and result. Replace stale recommendations with fresh choices, but retain the historical postmortem. Do not silently turn an unverified item into a rule. Do not store credentials or private system details here.
