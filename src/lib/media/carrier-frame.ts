import type { MediaType } from "@/lib/media/types";

export type MediaCarrierFrameRenderKind = "cartridge";

export type MediaCarrierFrame = {
  assetPath: string;
  aspectRatioClassName: string;
  coverAreaClassName: string;
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
    aspectRatioClassName: "aspect-[3/2]",
    coverAreaClassName: "left-[9.5%] top-[18.5%] h-[58.5%] w-[81%]",
    displayFontClassName: "media-carrier-font-nes",
    fontClassName: "media-carrier-font-nes",
    labelFontClassName: "media-carrier-font-nes",
    renderKind: "cartridge",
  },
  "game/sega": {
    assetPath: "/mediaCarriers/game/sega/cartridge.png",
    aspectRatioClassName: "aspect-[4/3]",
    coverAreaClassName: "left-[15.2%] top-[7.8%] h-[79.5%] w-[69.6%]",
    displayFontClassName: "media-carrier-font-sega",
    fontClassName: "media-carrier-font-sega",
    labelFontClassName: "media-carrier-font-sega",
    renderKind: "cartridge",
  },
  "game/snes": {
    assetPath: "/mediaCarriers/game/snes/cartridge.png",
    aspectRatioClassName: "aspect-[4/3]",
    coverAreaClassName: "left-[14.6%] top-[4.5%] h-[41.5%] w-[70.8%]",
    displayFontClassName: "media-carrier-font-sega",
    fontClassName: "media-carrier-font-sega",
    labelFontClassName: "media-carrier-font-sega",
    renderKind: "cartridge",
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
