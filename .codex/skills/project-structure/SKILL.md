---
name: project-structure
description: Use for new feature boundaries, shared modules, cross-feature abstractions, or structural refactors. Not for routine local helpers or focused edits.
---

# Project Structure Skill

Keep the codebase simple, layered, and easy to change.

## Rules

- Keep database access outside presentational UI components when the logic can reasonably live in a data/service layer.
- Keep reusable database access in dedicated modules.
- Keep genuinely shared constants and types in one source of truth.
- Avoid duplicating enum-like values across schema, UI, validation, and seed scripts.
- Prefer small helper functions for repeated formatting, mapping, parsing, or normalization logic.
- Do not create abstractions before there is a real repeated pattern.
- Keep feature-specific code close to the feature.
- Move code to shared modules only when reused or clearly part of the project core.
- Put reusable public archive UI patterns in `src/components/archive`.
- Keep feature-specific archive content, such as media previews or rating panels, close to the feature in `src/app` unless it is reused outside that feature.
- Put adaptive interaction rules in the shared layout or pattern component when the same behavior should stay consistent across archive screens.
- Prefer existing patterns over new abstractions.
