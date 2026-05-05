# AGENTS.md

## Project agents

Specialized agents are stored in `.codex/agents`.

Use these existing agents for meaningful work:

- `architect` — architecture, data model, product structure, feature boundaries
- `implementer` — code implementation
- `reviewer` — review, regressions, edge cases, data integrity
- `tester` — test strategy, unit/component tests, checking important scenarios

Do not generate new temporary agents for these roles.

## Workflow

For every meaningful feature, run the task through all three agents:

1. `architect` — clarify the approach and boundaries
2. `implementer` — implement the change
3. `tester` — add or update useful tests when the change has testable behavior
4. `reviewer` — review the result before considering it done

This applies to changes that affect:

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

For small mechanical changes, using all agents is not required.

Examples:

- fixing a typo
- renaming a label
- adjusting copy
- minor styling tweaks
- small obvious bug fixes
- formatting-only changes

## Project context

All agents must read `PROJECT_CONTEXT.md` before making decisions.

`PROJECT_CONTEXT.md` is the main source of project meaning and current direction.

## General rules

Keep changes focused.

Do not rewrite unrelated code.

Do not add libraries, abstractions, workflows, or integrations without a clear reason.

Prefer simple, reversible decisions while the project is still early and may change conceptually.

Respond to the user in Russian unless asked otherwise.

## Skills

Before implementation, check `.codex/skills` and use relevant existing skills.

## DB changes

At this point we have no production db, just local. So, do not create new migration, but change existing and clear DB.
I will change this rule after first production deploy.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
