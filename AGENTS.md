# AGENTS.md

## Project agents

Specialized agents are stored in `.codex/agents`.

Use existing agents when their role is directly relevant:

- `architect` — architecture, data model, product structure, feature boundaries
- `implementer` — code implementation
- `reviewer` — review, regressions, edge cases, data integrity
- `tester` — test strategy, unit/component tests, checking important scenarios

Do not generate new temporary agents for these roles.

## Context discipline

Keep context small.

Do not read the whole repository unless explicitly required.

Do not load all agents or all skills by default.

Before meaningful work:

- read `PROJECT_CONTEXT.md`
- choose only the agents needed for the task
- check only directly relevant `.codex/skills`
- state the current workflow phase

If local project agents cannot be run as separate sub-agents, use only the relevant role instructions manually.

## Workflow

Choose the minimal workflow needed for the task:

- architecture, data model, product boundaries → use `architect`
- code implementation → use `implementer`
- testable behavior → use `tester`
- finished diff, risky behavior, regressions → use `reviewer`

Use the full workflow:

1. `architect`
2. `implementer`
3. `tester`
4. `reviewer`

only for large or risky features.

This may apply to changes that affect:

- data model
- database schema
- public pages
- admin flows
- imports
- ratings
- media item logic
- project structure
- integrations
- non-trivial UI behavior

Use `tester` especially for changes that affect:

- data formatting
- filtering
- search
- helpers
- data mapping
- database-related behavior
- user-visible logic

## Small changes

For small mechanical changes, do not use the full workflow.

Examples:

- fixing a typo
- renaming a label
- adjusting copy
- minor styling tweaks
- small obvious bug fixes
- formatting-only changes

## Project context

`PROJECT_CONTEXT.md` is the main source of project meaning and current direction.

Read it before making product or architectural decisions.

For small mechanical changes, reading it is optional unless the change affects project behavior or meaning.

## General rules

Keep changes focused.

Do not rewrite unrelated code.

Do not add libraries, abstractions, workflows, or integrations without a clear reason.

Prefer simple, reversible decisions while the project is still early and may change conceptually.

Respond to the user in Russian unless asked otherwise.

## Verification

Do not run `npm run build` automatically after routine UI/code changes. In this project the Next.js/Turbopack production build can be heavy enough to freeze or crash VS Code.

Prefer lighter checks first:

- inspect the focused diff;
- use `rg` to verify imports/usages;
- run targeted tests or type/lint checks only when they are available and relevant.

Ask the user before running `npm run build`, unless they explicitly requested a production build check.

## Skills

Read `.codex/SKILLS_INDEX.md` when choosing a skill.
Open a skill file only when it directly matches the task.
Do not scan all skill files.

Use a skill only when the task clearly matches it.

The `media-carrier-skins` skill is mandatory for any work on media carrier visual skins: cover/frame assets, placeholders, cover geometry, carrier fonts, hover effects, rating panel styling, or archive presentation tied to a carrier/media type.

Do not scan all skills for every task.

Open only the directly relevant skill file.

## Next.js

This project may use a Next.js version with breaking changes.

Prefer project-local patterns already used in the codebase.

Read the relevant guide in `node_modules/next/dist/docs/` only when using unfamiliar or version-sensitive Next.js APIs.

Do not scan Next.js docs for routine changes.
