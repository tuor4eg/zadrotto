import type { MediaType } from "@/lib/media/types";

export type MediaCarrierFrameRenderKind =
  | "cartridge"
  | "cover-overlay"
  | "packaged-cover"
  | "streaming-cover";
export type MediaCarrierFrameCoverLayer = "above-frame" | "below-frame";
export type MediaCarrierFramePlaceholderVariant =
  | "dvd-label"
  | "dos-disk-label"
  | "eight-bit-label"
  | "reel-label"
  | "sixteen-bit-label"
  | "tv-screen-label"
  | "win9x-jewel-label"
  | "vhs-label";
export type MediaCarrierRatingPanelVariant =
  | "book-note"
  | "comic-card"
  | "dvd-menu"
  | "dos-terminal"
  | "film-strip"
  | "modern-tv-guide"
  | "nes-hearts"
  | "ps1-memory-card"
  | "steam-achievement"
  | "streaming-card"
  | "tv-guide"
  | "vhs-poster"
  | "win9x-window"
  | "windvd-aero";

const FILM_REEL_RELEASE_YEAR_TO = 1979;
const FILM_VHS_RELEASE_YEAR_FROM = FILM_REEL_RELEASE_YEAR_TO + 1;
const FILM_VHS_RELEASE_YEAR_TO = 2002;
const FILM_DVD_RELEASE_YEAR_FROM = FILM_VHS_RELEASE_YEAR_TO + 1;
const FILM_DVD_RELEASE_YEAR_TO = 2012;
const FILM_STREAMING_RELEASE_YEAR_FROM = FILM_DVD_RELEASE_YEAR_TO + 1;
const PC_DOS_RELEASE_YEAR_FROM = 1981;
const PC_DOS_RELEASE_YEAR_TO = 1996;
const PC_WIN9X_RELEASE_YEAR_FROM = PC_DOS_RELEASE_YEAR_TO + 1;
const PC_WIN9X_RELEASE_YEAR_TO = 2003;
const PC_WINDVD_RELEASE_YEAR_FROM = PC_WIN9X_RELEASE_YEAR_TO + 1;
const PC_WINDVD_RELEASE_YEAR_TO = 2012;
const PC_STEAM_RELEASE_YEAR_FROM = PC_WINDVD_RELEASE_YEAR_TO + 1;
const SERIES_TV_RELEASE_YEAR_TO = 2003;
const SERIES_MODERN_TV_RELEASE_YEAR_FROM = SERIES_TV_RELEASE_YEAR_TO + 1;
const SERIES_MODERN_TV_RELEASE_YEAR_TO = 2012;
const SERIES_STREAMING_RELEASE_YEAR_FROM = 2013;

export type MediaCarrierFrame = {
  assetPath: string;
  aspectRatioClassName: string;
  bottomOverlayClassName?: string;
  bottomOverlayPath?: string;
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
  streamingProgressLabel?: string;
  streamingTopBadgeLabel?: string;
  topGradientClassName?: string;
  titleIconHeight?: number;
  titleCursor?: string;
  titleIconPath?: string;
  titleIconWidth?: number;
  titleTemplate?: string;
  topLogoClassName?: string;
  topLogoPath?: string;
  viewportClassName?: string;
};

type MediaCarrierFrameInput = {
  mediaCarrierCode?: string | null;
  mediaType?: MediaType | null;
  releaseYear?: number | null;
};

const MEDIA_CARRIER_FRAMES: Record<string, MediaCarrierFrame> = {
  "book/book": {
    assetPath: "/mediaCarriers/book/book.png",
    aspectRatioClassName: "aspect-[679/1000]",
    compactSizeClassName: "h-[min(32vh,300px)] w-auto max-w-full",
    compactViewportClassName: "h-[min(32vh,300px)]",
    coverAreaClassName: "left-[13.2%] top-[3.5%] h-[88.4%] w-[82.2%]",
    placeholderVariant: "dvd-label",
    ratingPanelVariant: "book-note",
    renderKind: "cartridge",
    sizeClassName: "h-[min(58vh,520px)] w-auto max-w-full",
    viewportClassName: "h-[min(58vh,520px)]",
  },
  "comic/comic-book": {
    assetPath: "/mediaCarriers/comic/pp.png",
    aspectRatioClassName: "aspect-[619/960]",
    compactViewportClassName: "aspect-[619/960] w-full max-w-[13rem]",
    coverAreaClassName: "left-[3.5%] top-[2.8%] h-[94.4%] w-[93%]",
    displayFontClassName: "media-carrier-font-comic",
    fontClassName: "media-carrier-font-comic",
    labelFontClassName: "media-carrier-font-comic",
    placeholderVariant: "dvd-label",
    ratingPanelVariant: "comic-card",
    renderKind: "packaged-cover",
    sizeClassName: "w-full max-w-[360px]",
    viewportClassName: "aspect-[619/960] w-full max-w-[360px]",
  },
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
    compactSizeClassName: "h-[min(28vh,260px)] w-auto max-w-full sm:h-[min(32vh,300px)]",
    compactViewportClassName: "h-[min(28vh,260px)] max-w-full sm:h-[min(32vh,300px)]",
    coverAreaClassName: "left-[2.4%] top-[13.2%] h-[84.5%] w-[95.1%]",
    displayFontClassName: "media-carrier-font-pc-windvd",
    fontClassName: "media-carrier-font-pc-windvd",
    labelFontClassName: "media-carrier-font-pc-windvd",
    placeholderVariant: "win9x-jewel-label",
    ratingPanelVariant: "windvd-aero",
    renderKind: "cartridge",
    sizeClassName: "h-[min(44vh,380px)] w-auto max-w-full sm:h-[min(58vh,520px)]",
    titleIconHeight: 124,
    titleIconPath: "/mediaCarriers/game/pc/windvd/folder.png",
    titleIconWidth: 128,
    titleTemplate: "C ▸ {title}",
    viewportClassName: "h-[min(44vh,380px)] max-w-full sm:h-[min(58vh,520px)]",
  },
  "game/pc/steam": {
    assetPath: "/mediaCarriers/game/pc/steam/steam.jpg",
    aspectRatioClassName: "aspect-[3/4]",
    bottomOverlayClassName: "h-auto",
    bottomOverlayPath: "/mediaCarriers/game/pc/steam/steam.jpg",
    compactSizeClassName: "h-[min(28vh,260px)] w-auto max-w-full sm:h-[min(32vh,300px)]",
    compactViewportClassName: "h-[min(28vh,260px)] max-w-full sm:h-[min(32vh,300px)]",
    coverAreaClassName: "inset-0",
    displayFontClassName: "media-carrier-font-pc-steam",
    fontClassName: "media-carrier-font-pc-steam",
    labelFontClassName: "media-carrier-font-pc-steam",
    placeholderVariant: "win9x-jewel-label",
    ratingPanelVariant: "steam-achievement",
    renderKind: "cover-overlay",
    sizeClassName: "h-[min(44vh,380px)] w-auto max-w-full sm:h-[min(58vh,520px)]",
    topGradientClassName: "h-[30%] bg-gradient-to-b from-black/56 via-black/20 to-transparent",
    topLogoClassName: "left-[2%] top-[2%] w-[17%]",
    topLogoPath: "/mediaCarriers/game/pc/steam/steam-logo.png",
    viewportClassName: "h-[min(44vh,380px)] max-w-full sm:h-[min(58vh,520px)]",
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
  "film/reel": {
    assetPath: "/mediaCarriers/video/reel/reel.png",
    aspectRatioClassName: "aspect-[1000/1040]",
    compactSizeClassName: "w-[min(100%,18rem)] max-w-full sm:h-[min(32vh,300px)] sm:w-auto",
    compactViewportClassName: "w-[min(100%,18rem)] max-w-full sm:h-[min(32vh,300px)] sm:w-auto",
    coverAreaClassName: "left-[21.4%] top-[7.6%] h-[64.8%] w-[41.8%]",
    displayFontClassName: "media-carrier-font-film-reel",
    fontClassName: "media-carrier-font-film-reel",
    labelFontClassName: "media-carrier-font-film-reel-label",
    placeholderVariant: "reel-label",
    ratingPanelVariant: "film-strip",
    renderKind: "cartridge",
    sizeClassName: "w-[min(100%,22rem)] max-w-full lg:w-[min(100%,24rem)]",
    viewportClassName: "w-[min(100%,22rem)] max-w-full lg:w-[min(100%,24rem)]",
  },
  "film/streaming": {
    assetPath: "",
    aspectRatioClassName: "aspect-[2/3]",
    compactSizeClassName: "h-[min(30vh,280px)] w-auto max-w-full sm:h-[min(34vh,320px)]",
    compactViewportClassName: "h-[min(30vh,280px)] max-w-full sm:h-[min(34vh,320px)]",
    coverAreaClassName: "inset-0",
    displayFontClassName: "media-carrier-font-streaming",
    fontClassName: "media-carrier-font-streaming",
    labelFontClassName: "media-carrier-font-streaming",
    placeholderVariant: "tv-screen-label",
    ratingPanelVariant: "streaming-card",
    renderKind: "streaming-cover",
    sizeClassName: "h-[min(48vh,420px)] w-auto max-w-full sm:h-[min(62vh,560px)]",
    streamingProgressLabel: "2 ч 15 мин",
    viewportClassName: "h-[min(48vh,420px)] max-w-full sm:h-[min(62vh,560px)]",
  },
  "series/tv": {
    assetPath: "/mediaCarriers/video/tv/tv.png",
    aspectRatioClassName: "aspect-[1033/910]",
    compactSizeClassName: "w-[min(100%,18rem)] max-w-full",
    compactViewportClassName: "w-[min(100%,18rem)] max-w-full",
    coverAreaClassName: "left-[9.2%] top-[10.7%] h-[63.8%] w-[81.9%]",
    displayFontClassName: "media-carrier-font-tv-guide",
    fontClassName: "media-carrier-font-tv-guide",
    labelFontClassName: "media-carrier-font-tv-guide",
    placeholderVariant: "tv-screen-label",
    ratingPanelVariant: "tv-guide",
    renderKind: "cartridge",
    sizeClassName: "w-[min(100%,31rem)] max-w-full lg:w-[min(100%,34rem)]",
    viewportClassName: "w-[min(100%,31rem)] max-w-full lg:w-[min(100%,34rem)]",
  },
  "series/modern-tv": {
    assetPath: "/mediaCarriers/video/moderntv/tv.png",
    aspectRatioClassName: "aspect-[820/713]",
    compactSizeClassName: "w-[min(100%,18rem)] max-w-full",
    compactViewportClassName: "w-[min(100%,18rem)] max-w-full",
    coverAreaClassName: "left-[7.1%] top-[6.9%] h-[69%] w-[85.9%]",
    displayFontClassName: "media-carrier-font-modern-tv",
    fontClassName: "media-carrier-font-modern-tv",
    labelFontClassName: "media-carrier-font-modern-tv",
    placeholderVariant: "tv-screen-label",
    ratingPanelVariant: "modern-tv-guide",
    renderKind: "cartridge",
    sizeClassName: "w-[min(100%,31rem)] max-w-full lg:w-[min(100%,34rem)]",
    viewportClassName: "w-[min(100%,31rem)] max-w-full lg:w-[min(100%,34rem)]",
  },
  "series/streaming": {
    assetPath: "",
    aspectRatioClassName: "aspect-[2/3]",
    compactSizeClassName: "h-[min(30vh,280px)] w-auto max-w-full sm:h-[min(34vh,320px)]",
    compactViewportClassName: "h-[min(30vh,280px)] max-w-full sm:h-[min(34vh,320px)]",
    coverAreaClassName: "inset-0",
    displayFontClassName: "media-carrier-font-streaming",
    fontClassName: "media-carrier-font-streaming",
    labelFontClassName: "media-carrier-font-streaming",
    placeholderVariant: "tv-screen-label",
    ratingPanelVariant: "streaming-card",
    renderKind: "streaming-cover",
    sizeClassName: "h-[min(48vh,420px)] w-auto max-w-full sm:h-[min(62vh,560px)]",
    streamingProgressLabel: "Серия 3 из 8",
    streamingTopBadgeLabel: "Новый сезон",
    viewportClassName: "h-[min(48vh,420px)] max-w-full sm:h-[min(62vh,560px)]",
  },
};

function isFilmReelReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear <= FILM_REEL_RELEASE_YEAR_TO
  );
}

function isFilmVhsReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= FILM_VHS_RELEASE_YEAR_FROM &&
    releaseYear <= FILM_VHS_RELEASE_YEAR_TO
  );
}

function isFilmDvdReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= FILM_DVD_RELEASE_YEAR_FROM &&
    releaseYear <= FILM_DVD_RELEASE_YEAR_TO
  );
}

function isFilmStreamingReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= FILM_STREAMING_RELEASE_YEAR_FROM
  );
}

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

function isPcSteamReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= PC_STEAM_RELEASE_YEAR_FROM
  );
}

function isSeriesTvReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear <= SERIES_TV_RELEASE_YEAR_TO
  );
}

function isSeriesModernTvReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= SERIES_MODERN_TV_RELEASE_YEAR_FROM &&
    releaseYear <= SERIES_MODERN_TV_RELEASE_YEAR_TO
  );
}

function isSeriesStreamingReleaseYear(releaseYear?: number | null) {
  return (
    releaseYear !== null &&
    releaseYear !== undefined &&
    releaseYear >= SERIES_STREAMING_RELEASE_YEAR_FROM
  );
}

export function getMediaCarrierFrame(
  item: MediaCarrierFrameInput,
): MediaCarrierFrame | null {
  if (!item.mediaType) {
    return null;
  }

  if (item.mediaType === "film" && isFilmReelReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["film/reel"] ?? null;
  }

  if (item.mediaType === "film" && isFilmVhsReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["film/vhs"] ?? null;
  }

  if (item.mediaType === "film" && isFilmDvdReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["film/dvd"] ?? null;
  }

  if (item.mediaType === "film" && isFilmStreamingReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["film/streaming"] ?? null;
  }

  if (item.mediaType === "series" && isSeriesTvReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["series/tv"] ?? null;
  }

  if (item.mediaType === "series" && isSeriesModernTvReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["series/modern-tv"] ?? null;
  }

  if (item.mediaType === "series" && isSeriesStreamingReleaseYear(item.releaseYear) && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["series/streaming"] ?? null;
  }

  if (item.mediaType === "comic" && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["comic/comic-book"] ?? null;
  }

  if (item.mediaType === "book" && !item.mediaCarrierCode) {
    return MEDIA_CARRIER_FRAMES["book/book"] ?? null;
  }

  if (!item.mediaCarrierCode) {
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

    if (isPcSteamReleaseYear(item.releaseYear)) {
      return MEDIA_CARRIER_FRAMES["game/pc/steam"] ?? null;
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
