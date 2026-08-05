---
name: data-boundaries
description: Use for database schema/query changes, reusable data mapping, persistence rules, or non-trivial nullable/empty-state behavior. Not for routine component rendering.
---

# Data Boundaries Skill

Keep data access, data shaping, and UI rendering separated.

## Rules

- Do not put reusable database queries inside presentational components.
- Put shared queries in feature data modules.
- Map database rows to UI-friendly shapes in one place when needed.
- Extract formatting, parsing, or normalization when it is repeated.
- Keep nullable handling explicit.
- Store ratings as integers and format them for display through a helper.
- Handle empty states deliberately.
- When changing database schema or queries, briefly state whether indexes/constraints are needed for the expected filters, joins, sorting, and uniqueness rules.
