import type { MediaType } from "@/lib/media-types";

export type MediaCarrierFrameRenderKind = "nes-cartridge";

export type MediaCarrierFrame = {
  assetPath: string;
  displayFontClassName?: string;
  fontClassName?: string;
  labelFontClassName?: string;
  renderKind: MediaCarrierFrameRenderKind;
};

type MediaCarrierFrameInput = {
  mediaCarrierCode?: string | null;
  mediaType?: MediaType | null;
};

const MEDIA_CARRIER_FRAMES: Record<string, MediaCarrierFrame> = {
  "game/nes": {
    assetPath: "/mediaCarriers/game/nes/cartridge.png",
    displayFontClassName: "media-carrier-font-nes",
    fontClassName: "media-carrier-font-nes",
    labelFontClassName: "media-carrier-font-nes",
    renderKind: "nes-cartridge",
  },
};

export function getMediaCarrierFrame(
  item: MediaCarrierFrameInput,
): MediaCarrierFrame | null {
  if (!item.mediaType || !item.mediaCarrierCode) {
    return null;
  }

  return MEDIA_CARRIER_FRAMES[`${item.mediaType}/${item.mediaCarrierCode}`] ?? null;
}

export function hasMediaCarrierFrame(item: MediaCarrierFrameInput) {
  return getMediaCarrierFrame(item) !== null;
}
