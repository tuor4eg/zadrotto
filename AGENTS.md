# AGENTS.md

## Project agents

Specialists live in `.codex/agents`:

- `architect` — architecture, data model, product and feature boundaries;
- `implementer` — substantial independent implementation;
- `tester` — non-trivial test design or a separate test-writing pass;
- `reviewer` — risky diffs, regressions, security and data integrity.

The primary agent normally implements, tests, and reviews focused changes itself. Spawn a
specialist only when the task is large, risky, or contains an independent subtask that benefits
from separate context. Do not create temporary agents duplicating these roles. Pass specialists a
focused brief and the minimum useful conversation history.

## Context discipline

Keep context small. Before work, state the workflow phase and open only directly relevant skills
or files. Do not scan the repository, agents, skills, or Next.js docs without a concrete need.

Read `PROJECT_CONTEXT.md` for product meaning, architecture, data-model decisions, or large
features. It is not required for local fixes, routine implementation, tests, or review when no
product decision is involved.

## Workflow

Choose the smallest workflow covering the risk. Consider `architect → implementer → tester →
reviewer` only for large features combining several risk areas, such as schema changes with an
integration, security boundary, import, or non-trivial public/admin flow. A schema or UI change
alone does not require four agents.

For small mechanical changes—copy, labels, minor styles, formatting, obvious local bugs—work
directly without project agents.

## Project invariants

- Keep changes focused and preserve unrelated work.
- This is an early MVP: prefer simple, reversible decisions and avoid speculative abstractions or
  dependencies.
- Integrations, AI, Telegram, and visual experiments must not become foundations of the domain.
- Respond in Russian unless asked otherwise.
- In user-facing text call `MediaItem` «запись». Do not use «тайтл» in labels, messages,
  notifications, tooltips, or activity logs.

## Verification

Use the lightest relevant checks: focused diff, `rg`, targeted tests, typecheck, or targeted lint.
Do not run `npm run build` unless the user explicitly asks or approves it; the production build can
freeze or crash VS Code.

## Skills

Use `.codex/SKILLS_INDEX.md` only when the relevant skill is not already clear. Open only skills
whose descriptions directly match the task.

- `ai-integrations` is mandatory for AI providers, credentials, models, scenarios, prompts,
  endpoints, or AI-powered UI.
- `media-carrier-skins` is mandatory for carrier-specific covers, frames, placeholders, geometry,
  fonts, hover effects, rating styles, or archive presentation.

## Next.js

Prefer existing project patterns. Read the relevant guide in `node_modules/next/dist/docs/` only
for unfamiliar or version-sensitive APIs.
