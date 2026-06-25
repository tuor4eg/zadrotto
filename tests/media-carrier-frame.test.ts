import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatMediaCarrierTitle,
  getMediaCarrierFrame,
  hasMediaCarrierFrame,
} from "@/lib/media/carrier-frame";

describe("media carrier frames", () => {
  it("resolves NES cartridge frame by media type and carrier code", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "nes" }),
      {
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
    );
  });

  it("resolves Sega and SNES cartridge frames", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "sega" }),
      {
        assetPath: "/mediaCarriers/game/sega/cartridge.png",
        aspectRatioClassName: "aspect-[4/3]",
        coverAreaClassName: "left-[15.2%] top-[7.8%] h-[79.5%] w-[69.6%]",
        displayFontClassName: "media-carrier-font-sega",
        fontClassName: "media-carrier-font-sega",
        labelFontClassName: "media-carrier-font-sega",
        placeholderVariant: "sixteen-bit-label",
        renderKind: "cartridge",
      },
    );
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "snes" }),
      {
        assetPath: "/mediaCarriers/game/snes/cartridge.png",
        aspectRatioClassName: "aspect-[4/3]",
        coverAreaClassName: "left-[14.6%] top-[4.5%] h-[41.5%] w-[70.8%]",
        displayFontClassName: "media-carrier-font-sega",
        fontClassName: "media-carrier-font-sega",
        labelFontClassName: "media-carrier-font-sega",
        placeholderVariant: "sixteen-bit-label",
        renderKind: "cartridge",
      },
    );
  });

  it("resolves PS1 jewel frame by carrier code", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "ps1" }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "ps1", releaseYear: 1995 }),
      true,
    );
  });

  it("resolves PC DOS disk frame only inside the DOS release year period", () => {
    assert.deepEqual(
      getMediaCarrierFrame({
        mediaType: "game",
        mediaCarrierCode: "pc",
        releaseYear: 1981,
      }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 1996 }),
      true,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 1980 }),
      false,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: null }),
      false,
    );
  });

  it("resolves PC Win9x jewel frame after the DOS release year period", () => {
    assert.deepEqual(
      getMediaCarrierFrame({
        mediaType: "game",
        mediaCarrierCode: "pc",
        releaseYear: 1997,
      }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 2003 }),
      true,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 2004 }),
      true,
    );
  });

  it("resolves PC Windows DVD frame after the Win9x release year period", () => {
    assert.deepEqual(
      getMediaCarrierFrame({
        mediaType: "game",
        mediaCarrierCode: "pc",
        releaseYear: 2004,
      }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 2012 }),
      true,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 2013 }),
      true,
    );
  });

  it("resolves PC Steam cover overlay after the Windows DVD release year period", () => {
    assert.deepEqual(
      getMediaCarrierFrame({
        mediaType: "game",
        mediaCarrierCode: "pc",
        releaseYear: 2013,
      }),
      {
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
    );
  });

  it("resolves film carrier frames", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: "vhs" }),
      {
        assetPath: "/mediaCarriers/video/vhs/vhs.png",
        aspectRatioClassName: "aspect-[767/1463]",
        compactSizeClassName: "h-[min(32vh,300px)] w-auto max-w-full",
        compactViewportClassName: "h-[min(32vh,300px)]",
        coverAreaClassName: "left-[24.8%] top-[30.4%] h-[38.2%] w-[51.6%]",
        coverLayer: "above-frame",
        displayFontClassName: "media-carrier-font-vhs",
        fontClassName: "media-carrier-font-vhs",
        labelFontClassName: "media-carrier-font-vhs",
        placeholderVariant: "vhs-label",
        ratingPanelVariant: "vhs-poster",
        renderKind: "cartridge",
        sizeClassName: "h-[min(58vh,520px)] w-auto max-w-full",
        viewportClassName: "h-[min(58vh,520px)]",
      },
    );
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: "dvd" }),
      {
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
    );
    assert.equal(hasMediaCarrierFrame({ mediaType: "anime", mediaCarrierCode: "vhs" }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: "anime", mediaCarrierCode: "dvd" }), false);
  });

  it("uses reel frame for films released before 1980 when no carrier is selected", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: null, releaseYear: 1979 }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: null, releaseYear: 1980 }),
      false,
    );
    assert.equal(
      getMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: "vhs", releaseYear: 1979 })?.assetPath,
      "/mediaCarriers/video/vhs/vhs.png",
    );
  });

  it("uses TV frame for series released before 2004 when no carrier is selected", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "series", mediaCarrierCode: null, releaseYear: 2003 }),
      {
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
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "series", mediaCarrierCode: null, releaseYear: 2004 }),
      false,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "series", mediaCarrierCode: "dvd", releaseYear: 2003 }),
      false,
    );
  });

  it("keeps unknown carriers and empty carrier values frameless", () => {
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc" }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: null }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: null, mediaCarrierCode: "nes" }), false);
  });

  it("formats carrier title through an optional title template", () => {
    const pcDosFrame = getMediaCarrierFrame({
      mediaType: "game",
      mediaCarrierCode: "pc",
      releaseYear: 1993,
    });

    assert.equal(
      formatMediaCarrierTitle("Dune II: The Building of a Dynasty", pcDosFrame),
      "C:\\Dune II: The Building of a Dynasty>",
    );
    assert.equal(formatMediaCarrierTitle("Sonic the Hedgehog", getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "sega" })), "Sonic the Hedgehog");
    assert.equal(
      formatMediaCarrierTitle("Fallout", getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 1997 })),
      "C:\\Fallout",
    );
    assert.equal(
      formatMediaCarrierTitle("Mass Effect", getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 2008 })),
      "C ▸ Mass Effect",
    );
  });
});
