---
name: public-archive-ui
description: Use when changing the shared public header, navigation, breadcrumbs, page containers, or coordinated layouts across the archive, series, collections, reviews, media pages, and public profiles. Not for author/admin shells or carrier-specific skins.
---

# Public Archive UI

Preserve one coherent public shell without duplicating header or session-loading logic.

## Shared shell

- Reuse `PublicSiteHeader` from `src/components/archive/public-site-header.tsx` and load its state through `getPublicSiteHeaderState` from `src/lib/archive/public-site-header.ts`.
- Apply it to public routes. Keep `/author`, `/admin`, authentication forms, and system error pages on their own shells.
- Use an outer public container up to `1480px` wide and a `0.75rem` (`gap-3`) gap between the header and primary content. Narrow content may use an inner max-width without narrowing the header.
- Keep the header transparent, non-sticky, and visually aligned across public pages. Do not add a separate header background.

## Header and navigation

- Keep the brand, `Архив / Серии / Подборки`, search or page controls, notifications, admin action, and avatar/login in one row.
- Preserve the action order `уведомления → админка → аватар`. Show the admin badge only for a non-zero moderation count.
- On `/archive`, put search, exploration, filters, and sorting in the same header row. Search updates `q` with the existing 250 ms debounce, preserves other parameters, resets `page`, and clears `q` immediately when emptied.
- Breadcrumbs start at the nearest useful section; do not repeat `Главная` or `Архив`, which are already available in the shared header.

## Boundaries

- Keep reusable public archive UI in `src/components/archive`; keep route-specific content in `src/app`.
- Editorial collections use the existing document/query boundary in `src/components/archive/editorial-*` and `src/db/queries/editorial-*`.
- Use `media-carrier-skins` instead for carrier-specific cover frames, geometry, fonts, or placeholders.

Verify affected public routes with focused contract tests, targeted lint, and `git diff --check`. Do not run a production build unless requested.
