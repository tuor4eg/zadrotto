---
name: project-structure
description: Use for new feature boundaries, shared modules, cross-feature abstractions, or structural refactors. Not for routine local helpers or focused edits.
---

# Project Structure

- Keep feature-specific code close to its feature; move it to shared modules only after real reuse or when it is clearly project core.
- Keep enum-like constants and shared contracts in one source of truth.
- Prefer existing patterns and small helpers; do not create speculative layers, registries or dependencies.
- Put reusable public archive UI in `src/components/archive`.
- Keep feature-specific archive content in `src/app` unless another feature reuses it.
- Put adaptive interaction rules in a shared layout or pattern component only when several archive screens must behave consistently.
- Use `data-boundaries` for database access, persistence, mapping and nullable-state rules.
