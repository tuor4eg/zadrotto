import type { MediaType } from "@/lib/media/types";

export type MediaCarrierFrameRenderKind = "cartridge";
export type MediaCarrierFrameCoverLayer = "above-frame" | "below-frame";
export type MediaCarrierFramePlaceholderVariant =
  | "dos-disk-label"
  | "eight-bit-label"
  | "sixteen-bit-label"
  | "vhs-label";
export type MediaCarrierRatingPanelVariant = "dos-terminal" | "nes-hearts" | "vhs-poster";

const PC_DOS_RELEASE_YEAR_FROM = 1981;
const PC_DOS_RELEASE_YEAR_TO = 1996;

export type MediaCarrierFrame = {
  assetPath: string;
  aspectRatioClassName: string;
  compactSizeClassName?: string;
  compactViewportClassName?: string;
  coverLayer?: MediaCarrierFrameCoverLayer;
  coverAreaClassName: string;
  displayFontClassName?: string;
  fontClassName?: string;
  labelFontClassName?: string;
  placeholderVariant: MediaCarrierFramePlaceholderVariant;
  ratingPanelVariant?: MediaCarrierRatingPanelVariant;
  renderKind: MediaCarrierFrameRenderKind;
  sizeClassName?: string;
  titleCursor?: string;
  titleTemplate?: string;
  viewportClassName?: string;
};

type MediaCarrierFrameInput = {
  mediaCarrierCode?: string | null;
  mediaType?: MediaType | null;
  releaseYear?: number | null;
};

const MEDIA_CARRIER_FRAMES: Record<string, MediaCarrierFrame> = {
  "game/nes": {
    assetPath: "/mediaCarriers/game/nes/cartridge.png",
    aspectRatioClassName: "aspect-[3/2]",
    coverAreaClassName: "left-[9.5%] top-[18.5%] h-[58.5%] w-[81%]",
    displayFontClassName: "media-carrier-font-nes",
    fontClassName: "media-carrier-font-nes",
    labelFontClassName: "media-carrier-font-nes",
    placeholderVariant: "eight-bit-label",
    ratingPanelVariant: "nes-hearts",
    renderKind: "cartridge",
  },
  "game/pc": {
    assetPath: "/mediaCarriers/game/pc/dos/disk35.png",
    aspectRatioClassName: "aspect-square",
    coverAreaClassName: "left-[12%] top-[61%] h-[35%] w-[76.5%]",
    displayFontClassName: "media-carrier-font-pc-dos",
    fontClassName: "media-carrier-font-pc-dos",
    labelFontClassName: "media-carrier-font-pc-dos",
    placeholderVariant: "dos-disk-label",
    ratingPanelVariant: "dos-terminal",
    renderKind: "cartridge",
    titleCursor: "_",
    titleTemplate: "C:\\{title}>",
  },
  "game/sega": {
    assetPath: "/mediaCarriers/game/sega/cartridge.png",
    aspectRatioClassName: "aspect-[4/3]",
    coverAreaClassName: "left-[15.2%] top-[7.8%] h-[79.5%] w-[69.6%]",
    displayFontClassName: "media-carrier-font-sega",
    fontClassName: "media-carrier-font-sega",
    labelFontClassName: "media-carrier-font-sega",
    placeholderVariant: "sixteen-bit-label",
    renderKind: "cartridge",
  },
  "game/snes": {
    assetPath: "/mediaCarriers/game/snes/cartridge.png",
    aspectRatioClassName: "aspect-[4/3]",
    coverAreaClassName: "left-[14.6%] top-[4.5%] h-[41.5%] w-[70.8%]",
    displayFontClassName: "media-carrier-font-sega",
    fontClassName: "media-carrier-font-sega",
    labelFontClassName: "media-carrier-font-sega",
    placeholderVariant: "sixteen-bit-label",
    renderKind: "cartridge",
  },
  "film/vhs": {
    assetPath: "/mediaCarriers/video/vhs.png",
    aspectRatioClassName: "aspect-[767/1463]",
    coverAreaClassName: "left-[24.8%] top-[30.4%] h-[38.2%] w-[51.6%]",
    coverLayer: "above-frame",
    displayFontClassName: "media-carrier-font-vhs",
    fontClassName: "media-carrier-font-vhs",
    labelFontClassName: "media-carrier-font-vhs",
    placeholderVariant: "vhs-label",
    ratingPanelVariant: "vhs-poster",
    renderKind: "cartridge",
    compactSizeClassName: "h-[min(32vh,300px)] w-auto max-w-full",
    compactViewportClassName: "h-[min(32vh,300px)]",
    sizeClassName: "h-[min(58vh,520px)] w-auto max-w-full",
    viewportClassName: "h-[min(58vh,520px)]",
  },
};

function isPcDosReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= PC_DOS_RELEASE_YEAR_FROM &&
    releaseYear <= PC_DOS_RELEASE_YEAR_TO
  );
}

export function getMediaCarrierFrame(
  item: MediaCarrierFrameInput,
): MediaCarrierFrame | null {
  if (!item.mediaType || !item.mediaCarrierCode) {
    return null;
  }

  if (
    `${item.mediaType}/${item.mediaCarrierCode}` === "game/pc" &&
    !isPcDosReleaseYear(item.releaseYear)
  ) {
    return null;
  }

  return MEDIA_CARRIER_FRAMES[`${item.mediaType}/${item.mediaCarrierCode}`] ?? null;
}

export function formatMediaCarrierTitle(title: string, frame?: MediaCarrierFrame | null) {
  if (!frame?.titleTemplate) {
    return title;
  }

  return frame.titleTemplate.replaceAll("{title}", title);
}

export function hasMediaCarrierFrame(item: MediaCarrierFrameInput) {
  return getMediaCarrierFrame(item) !== null;
}
