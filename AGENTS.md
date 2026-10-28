# AGENTS.md

## Project agents

Specialists live in `.codex/agents`:

- `architect` — architecture, data model, product and feature boundaries;
- `implementer` — substantial independent implementation;
- `tester` — non-trivial test design or a separate test-writing pass;
- `reviewer` — risky diffs, regressions, security and data integrity.

The primary agent normally implements, tests, and reviews focused changes itself. Spawn a
specialist only when the task is large, risky, or contains an independent subtask that benefits
from separate context. Do not create temporary agents duplicating these roles.

Start specialists with fresh context instead of inheriting the full chat. Pass a short brief:
objective, owned files, relevant invariants/skills, agreed interfaces, and completed checks.
Include conversation excerpts only when they contain a necessary decision. Give each agent a
distinct responsibility and verification scope; avoid overlapping implementations or checks.

## Context discipline

Keep context small. Before work, state the workflow phase and open only directly relevant skills
or files. Do not scan the repository, agents, skills, or Next.js docs without a concrete need.
Reuse instructions and findings already read in this task unless they changed. For long files,
find the relevant section with `rg` and read that section instead of the whole document.

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

When making substantial architectural changes, check the relevant documents in
`docs/architecture/` and update them within the same task. This includes changes to domain
boundaries, sources of truth, data relationships, integration pipelines, background processing,
or architectural invariants. Cosmetic changes and local fixes that do not affect architecture
do not require architecture documentation updates.

## Project invariants

- Keep changes focused and preserve unrelated work.
- This is an early MVP: prefer simple, reversible decisions and avoid speculative abstractions or
  dependencies.
- Design wide admin data tables responsively from the start: keep the table for desktop, but render
  the same rows as readable cards on mobile instead of relying on horizontal scrolling.
- Integrations, AI, Telegram, and visual experiments must not become foundations of the domain.
- Minimize environment variables. If a setting or operational switch can be managed through the
  admin UI, implement it there using persisted settings instead of adding an environment variable.
  Reserve environment variables for deployment configuration and bootstrap requirements.
- Respond in Russian unless asked otherwise.
- In user-facing text call `MediaItem` «запись». Do not use «тайтл» in labels, messages,
  notifications, tooltips, or activity logs.
- For searches over human-readable text, use `normalizeSearchText` and the matching SQL helper
  instead of custom lowercase, `ILIKE`, or `includes` normalization. Do not apply this rule to
  technical identifiers, email addresses, logins, tokens, or secrets.

## Verification

Use the lightest relevant checks: focused diff, `rg`, targeted tests, typecheck, or targeted lint.
Before delegation, assign one owner to each check. Specialists run checks for their own changes;
the primary agent owns the final integration check unless explicitly delegated. Run a project-wide
typecheck once after integration when relevant; do not have every agent repeat it.

Reuse a successful check while its inputs and affected behavior remain unchanged. Repeat only the
checks affected by subsequent edits, a failure, or a concrete unresolved concern. Documentation-only
changes need a focused diff, not application tests or typecheck. Report results briefly; keep full
logs outside the conversation and read failure excerpts when needed.

Do not run `npm run build` unless the user explicitly asks or approves it; the production build can
freeze or crash VS Code.

### Database query performance

Choose performance verification according to risk; do not spend tokens and time on large
benchmarks for routine changes. For bounded point reads or single-row writes by PK/unique key,
inspect the query, relevant indexes and FK behavior, and run a focused correctness check.
Do not create large synthetic fixtures or run EXPLAIN automatically for such changes. Escalate
only when there is a concrete concern: unindexed access, large relationship fan-out, locking,
N+1 queries, or a reported performance problem.

For queries whose cost grows with data volume (search, lists, aggregates, bulk operations):

- Start with generated SQL, index compatibility, joins/fan-out and pagination/count behavior.
  Reuse existing plans and measurements when the access path is unchanged; an analogous query
  does not need a new scale fixture merely because it serves another provider or media type.
- For a new or materially changed access path, inspect its execution plan. Use
  `EXPLAIN (ANALYZE, BUFFERS)` for safe reads; never execute a mutation just to benchmark it
  against application data. Inspect write plans without execution or use an isolated test DB.
- Build representative-scale fixtures only for a concrete scale risk: an unverified growing
  scan, fan-out, sort, correlated loops/N+1, locking, or a reported performance problem.
  State the risk first, measure only the affected query, and reuse existing fixture setup.
  Use an isolated DB, realistic distributions and `ANALYZE`; never seed application data.
- Report the checked access path, measured scale when applicable, and remaining limits.
  Small local timings alone do not verify scalability. A sequential scan on a tiny table is
  not automatically a defect, and an index alone does not prove efficiency.

## Skills

Use `.codex/SKILLS_INDEX.md` only when the relevant skill is not already clear. Open only skills
whose descriptions directly match the task.

- `ai-integrations` is mandatory for AI providers, credentials, models, scenarios, prompts,
  endpoints, or AI-powered UI.
- `media-carrier-skins` is mandatory for carrier-specific covers, frames, placeholders, geometry,
  fonts, hover effects, rating styles, or archive presentation.
- `user-state-modes` is mandatory for guest/demo/authorized state, local demo persistence,
  onboarding, login prompts, demo import, and mode-dependent personal archive actions.
- `security-audit` is mandatory when the user explicitly requests a security audit,
  vulnerability assessment, threat hunt, or penetration-oriented review of the codebase.

## Next.js

Prefer existing project patterns. Read the relevant guide in `node_modules/next/dist/docs/` only
for unfamiliar or version-sensitive APIs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Provider snapshot links

`provider_snapshot_links` uses polymorphic references validated by the server registry in
`src/lib/providers/entities.ts`. Attach, delete and merge must lock the target and change its
snapshot links in the same transaction through the shared helpers. Register new entity types
in code; never accept table names from requests. Direct SQL and new FK cascades bypass this
application-level guarantee: migration/import/delete scripts must explicitly remove or move
links atomically. Do not remove shared provider snapshots when deleting one entity.
