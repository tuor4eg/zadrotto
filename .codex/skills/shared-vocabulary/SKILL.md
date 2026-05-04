---
name: project-structure
description: Use when adding or changing application code structure, shared logic, constants, types, or helpers.
---

# Project Structure Skill

## Goal

Keep the codebase simple, layered, and easy to change.

## Rules

- Do not put database queries directly inside UI components if the logic can reasonably live in a separate data/service layer.
- Keep reusable database access in dedicated modules.
- Keep shared constants in one place and reuse them.
- Keep shared TypeScript types in one place when they are used by multiple modules.
- Avoid duplicating enum-like values across schema, UI, validation, and seed scripts.
- Prefer small helper functions for repeated formatting, mapping, parsing, or normalization logic.
- Do not create abstractions before there is a real repeated pattern.
- Keep feature-specific code close to the feature.
- Move code to shared modules only when it is reused or clearly belongs to the project core.