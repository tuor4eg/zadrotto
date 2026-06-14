---
name: project-structure
description: Use when adding or changing application structure, shared logic, constants, types, helpers, or feature boundaries.
---

# Project Structure Skill

Keep the codebase simple, layered, and easy to change.

## Rules

- Keep database access outside presentational UI components when the logic can reasonably live in a data/service layer.
- Keep reusable database access in dedicated modules.
- Keep shared constants in one place and reuse them.
- Keep shared TypeScript types in one place when they are used by multiple modules.
- Avoid duplicating enum-like values across schema, UI, validation, and seed scripts.
- Prefer small helper functions for repeated formatting, mapping, parsing, or normalization logic.
- Do not create abstractions before there is a real repeated pattern.
- Keep feature-specific code close to the feature.
- Move code to shared modules only when it is reused or clearly belongs to the project core.
- Put reusable public archive UI patterns in `src/components/archive`.
- Keep feature-specific archive content, such as media previews or rating panels, close to the feature in `src/app` unless it is reused outside that feature.
- Put adaptive interaction rules in the shared layout or pattern component when the same behavior should stay consistent across archive screens.
- Maximum reuse of existing code and patterns is preferred over adding new abstractions or modules.
- If you create UI pattern check could it be reused in other places as component of helper.
- UI should be in Russian everywhere.
