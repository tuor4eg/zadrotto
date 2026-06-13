import type { MediaType } from "@/lib/media/types";

export type MediaCarrierFrameRenderKind = "cartridge";
export type MediaCarrierFrameCoverLayer = "above-frame" | "below-frame";
export type MediaCarrierFramePlaceholderVariant =
  | "dvd-label"
  | "dos-disk-label"
  | "eight-bit-label"
  | "sixteen-bit-label"
  | "win9x-jewel-label"
  | "vhs-label";
export type MediaCarrierRatingPanelVariant =
  | "dvd-menu"
  | "dos-terminal"
  | "nes-hearts"
  | "ps1-memory-card"
  | "vhs-poster"
  | "win9x-window"
  | "windvd-aero";

const PC_DOS_RELEASE_YEAR_FROM = 1981;
const PC_DOS_RELEASE_YEAR_TO = 1996;
const PC_WIN9X_RELEASE_YEAR_FROM = PC_DOS_RELEASE_YEAR_TO + 1;
const PC_WIN9X_RELEASE_YEAR_TO = 2003;
const PC_WINDVD_RELEASE_YEAR_FROM = PC_WIN9X_RELEASE_YEAR_TO + 1;
const PC_WINDVD_RELEASE_YEAR_TO = 2012;

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
  titleIconHeight?: number;
  titleCursor?: string;
  titleIconPath?: string;
  titleIconWidth?: number;
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
  "game/pc/win9x": {
    assetPath: "/mediaCarriers/game/pc/win9x/jewel.png",
    aspectRatioClassName: "aspect-[10/9]",
    coverAreaClassName: "left-[12.2%] top-[9.6%] h-[87.6%] w-[65.1%]",
    displayFontClassName: "media-carrier-font-pc-win9x",
    fontClassName: "media-carrier-font-pc-win9x",
    labelFontClassName: "media-carrier-font-pc-win9x",
    placeholderVariant: "win9x-jewel-label",
    ratingPanelVariant: "win9x-window",
    renderKind: "cartridge",
    titleIconHeight: 123,
    titleIconPath: "/mediaCarriers/game/pc/win9x/folder.png",
    titleIconWidth: 160,
    titleTemplate: "C:\\{title}",
  },
  "game/pc/windvd": {
    assetPath: "/mediaCarriers/game/pc/windvd/dvd.png",
    aspectRatioClassName: "aspect-[3/4]",
    compactSizeClassName: "h-[min(32vh,300px)] w-auto max-w-full",
    compactViewportClassName: "h-[min(32vh,300px)]",
    coverAreaClassName: "left-[2.4%] top-[13.2%] h-[84.5%] w-[95.1%]",
    displayFontClassName: "media-carrier-font-pc-windvd",
    fontClassName: "media-carrier-font-pc-windvd",
    labelFontClassName: "media-carrier-font-pc-windvd",
    placeholderVariant: "win9x-jewel-label",
    ratingPanelVariant: "windvd-aero",
    renderKind: "cartridge",
    sizeClassName: "h-[min(58vh,520px)] w-auto max-w-full",
    titleIconHeight: 124,
    titleIconPath: "/mediaCarriers/game/pc/windvd/folder.png",
    titleIconWidth: 128,
    titleTemplate: "C ▸ {title}",
    viewportClassName: "h-[min(58vh,520px)]",
  },
  "game/ps1": {
    assetPath: "/mediaCarriers/game/ps1/jewel.png",
    aspectRatioClassName: "aspect-[209/208]",
    coverAreaClassName: "left-[19.7%] top-[1.9%] h-[95%] w-[76.8%]",
    displayFontClassName: "media-carrier-font-ps1",
    fontClassName: "media-carrier-font-ps1",
    labelFontClassName: "media-carrier-font-ps1",
    placeholderVariant: "win9x-jewel-label",
    ratingPanelVariant: "ps1-memory-card",
    renderKind: "cartridge",
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
    assetPath: "/mediaCarriers/video/vhs/vhs.png",
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
  "film/dvd": {
    assetPath: "/mediaCarriers/video/dvd/dvd.png",
    aspectRatioClassName: "aspect-[357/490]",
    compactSizeClassName: "h-[min(32vh,300px)] w-auto max-w-full",
    compactViewportClassName: "h-[min(32vh,300px)]",
    coverAreaClassName: "left-[4.8%] top-[8%] h-[90.8%] w-[90.4%]",
    displayFontClassName: "media-carrier-font-film-dvd",
    fontClassName: "media-carrier-font-film-dvd",
    labelFontClassName: "media-carrier-font-film-dvd",
    placeholderVariant: "dvd-label",
    ratingPanelVariant: "dvd-menu",
    renderKind: "cartridge",
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

function isPcWin9xReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= PC_WIN9X_RELEASE_YEAR_FROM &&
    releaseYear <= PC_WIN9X_RELEASE_YEAR_TO
  );
}

function isPcWinDvdReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= PC_WINDVD_RELEASE_YEAR_FROM &&
    releaseYear <= PC_WINDVD_RELEASE_YEAR_TO
  );
}

export function getMediaCarrierFrame(
  item: MediaCarrierFrameInput,
): MediaCarrierFrame | null {
  if (!item.mediaType || !item.mediaCarrierCode) {
    return null;
  }

  if (`${item.mediaType}/${item.mediaCarrierCode}` === "game/pc") {
    if (isPcDosReleaseYear(item.releaseYear)) {
      return MEDIA_CARRIER_FRAMES["game/pc"] ?? null;
    }

    if (isPcWin9xReleaseYear(item.releaseYear)) {
      return MEDIA_CARRIER_FRAMES["game/pc/win9x"] ?? null;
    }

    if (isPcWinDvdReleaseYear(item.releaseYear)) {
      return MEDIA_CARRIER_FRAMES["game/pc/windvd"] ?? null;
    }

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
