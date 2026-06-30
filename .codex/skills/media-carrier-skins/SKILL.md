---
name: media-carrier-skins
description: Use whenever creating, editing, fixing, or reviewing visual skins for media carriers, cover placeholders, carrier-specific fonts, cover geometry, hover effects, rating panel styling, or archive media presentation tied to a carrier/media type.
---

# Media Carrier Skins

Use this skill for any work on media carrier visuals: cartridges, tapes, discs, comic packaging, cover overlays, placeholder art, frame geometry, carrier fonts, and carrier-specific rating/card/detail styling.

## Core Rule

Media carrier skins must be unified through `getMediaCarrierFrame` and the `MediaCarrierFrame` contract in `src/lib/media/carrier-frame.ts`.

Do not add separate per-media-type skin checks in UI components when the behavior can be expressed as a carrier frame. Cards, previews, details, rating panels, fonts, cover geometry, placeholders, and hover behavior should read from the same frame object so a skin is applied consistently across archive screens.

## Workflow

1. Check the existing carrier frame entries in `src/lib/media/carrier-frame.ts` before changing UI.
2. Make the carrier key match real data: `${mediaType}/${mediaCarrierCode}`. If the media type needs a default skin without an explicit carrier, add a fallback in `getMediaCarrierFrame`.
3. Put shared skin data on `MediaCarrierFrame`: asset path, `renderKind`, aspect ratio, cover area, viewport/size classes, font classes, title template, and rating panel variant.
4. Add a new `renderKind` only when existing renderers cannot express the skin. Keep the renderer generic and driven by `frame`.
5. Keep archive screens using `getMediaCarrierFrame(item)` instead of duplicating skin decisions locally.
6. For rating panels, add/use a `ratingPanelVariant` and keep archive/author panel styling in the shared rating components. Rating colors must come from `src/lib/ratings/tone.ts` via `getRatingTone(score)` and tone class maps, not from one-off local colors.
7. For the general list, preserve the existing opt-out behavior when `ArchiveCover` is called with `carrierFrame={false}`.
8. Verify with light checks first: focused diff and `rg` for imports/usages. Prefer `npm run typecheck` when TypeScript unions/imports changed. Do not run `npm run build` unless the user asks or approves it.

## Common Files

- `src/lib/media/carrier-frame.ts` — source of truth for carrier skins.
- `src/app/media-item-tile.tsx` — cover renderers and general/archive cover behavior.
- `src/app/media-item-details.tsx` — media details/dossier screen.
- `src/app/media-catalog-preview.tsx` — catalog preview/dossier.
- `src/app/media-rating-panel.tsx` and `src/app/media-item-rating-dialog.tsx` — rating panel presentation.
- `src/lib/ratings/tone.ts` — rating tone thresholds and shared color class maps.

## Guardrails

- Do not special-case one media type across multiple UI files if a frame entry can carry the same data.
- Do not let a skin apply to the general list unless that list intentionally enables carrier frames.
- When fixing a missing skin, first check whether the frame key matches the actual `mediaCarrierCode`.
- If adding raster assets, keep them under the relevant `public/mediaCarriers/...` folder, inspect dimensions/weight, compress them, and make transparency real instead of leaving visual checkerboards or white backgrounds baked into RGB pixels.
- Prefer provided/real bitmap assets for distinctive carrier decoration when they exist. Use CSS-drawn shapes only when no asset is available or the shape is intentionally simple.
