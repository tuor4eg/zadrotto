---
name: media-carrier-skins
description: Use whenever creating, editing, fixing, or reviewing visual skins for media carriers, cover placeholders, carrier-specific fonts, cover geometry, hover effects, rating panel styling, or archive media presentation tied to a carrier/media type.
---

# Media Carrier Skins

Unify carrier visuals through `getMediaCarrierFrame` and `MediaCarrierFrame` in `src/lib/media/carrier-frame.ts`. Do not spread per-media-type checks across UI when the frame can express the behavior.

## Workflow

1. Inspect existing frames and verify the real key `${mediaType}/${mediaCarrierCode}`. For a default without an explicit carrier, use a fallback in `getMediaCarrierFrame`.
2. Put shared presentation on the frame: asset, `renderKind`, aspect ratio, cover area, size/font classes, title template and `ratingPanelVariant`.
3. Add a `renderKind` only when existing generic renderers cannot express the skin. Cards, previews and details must consume the same frame.
4. Keep rating styling in shared rating components. Derive colors through `getRatingTone(score)` and maps from `src/lib/ratings/tone.ts`.
5. Preserve the general-list opt-out when `ArchiveCover` receives `carrierFrame={false}`.

Primary consumers are `src/app/media-item-tile.tsx`, `media-item-details.tsx` and `media-catalog-preview.tsx`. Prefer existing patterns and assets.

For raster decoration, use the relevant `public/mediaCarriers/...` folder, inspect dimensions and weight, compress assets, and preserve real transparency. Prefer real provided assets for distinctive decoration; use CSS for intentionally simple shapes.

Verify with focused diff and `rg`; run typecheck when TypeScript contracts or imports change. Do not run the production build without approval.
