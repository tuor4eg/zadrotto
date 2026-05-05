---
name: data-boundaries
description: Use when reading, writing, mapping, or displaying application data.
---

# Data Boundaries Skill

Keep data access, data shaping, and UI rendering separated.

## Rules

- Do not put reusable database queries inside presentational components.
- Put shared queries in feature data modules.
- Map database rows to UI-friendly shapes in one place when needed.
- Do not duplicate formatting logic across components.
- Use helpers for repeated formatting, parsing, or normalization.
- Keep nullable handling explicit.
- Store ratings as integers and format them for display through a helper.
- Handle empty states deliberately.
- When changing database schema or queries, briefly state whether indexes/constraints are needed for the expected filters, joins, sorting, and uniqueness rules.