---
name: user-state-modes
description: Use when changing guest, demo, or authorized user state; local demo persistence; onboarding or login prompts; demo-to-account import; or personal archive actions whose behavior depends on user mode. Not for ordinary authentication internals without demo or mode interaction.
---

# User State Modes

Preserve one explicit model with three modes: `plain`, `demo`, and `authorized`. Keep shared mode
contracts in `src/lib/user-state`; do not emulate authorization with a fake author object.

## Trust and persistence

- Treat `localStorage` as untrusted, unavailable, and potentially from another app version. Parse it
  through the canonical demo-profile parser and keep storage failures non-fatal.
- Version the persisted shape. When its schema changes, deliberately migrate or reject older and
  newer versions; do not silently reinterpret an unknown version as current.
- Demo data stays device-local until an authenticated server action validates and imports it.
- Keep ratings and `wanted / skipped` mutually exclusive for the same record.
- Clear demo profile, onboarding, and demo toast state together only after a successful import or an
  explicit reset. Preserve recoverable local data after an import failure.

## Mode transitions and import

- A real authenticated author always wins over demo state in rendering and mutations.
- Import only into empty server slots. Never overwrite an account rating, experience, or status with
  demo data; inaccessible, unpublished, missing, or conflicting records are skipped.
- Design import for retries and partial failure. Avoid duplicate domain effects and report imported
  versus skipped values accurately.
- Demo-only achievements are derived projections, not server grants. Use
  `domain-events-achievements` when changing their mechanics, catalog, or toast behavior.

## Verification

Cover the affected transitions and boundaries: `plain → demo`, `demo → authorized`, real account
precedence, malformed or unavailable storage, schema-version mismatch, rating/status conflicts,
retry or partial import, reset, and cross-tab updates. Use focused pure-logic tests first; add route
or UI contract coverage only for behavior that cannot be protected at the model boundary.
