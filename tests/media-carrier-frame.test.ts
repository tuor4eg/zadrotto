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
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: 1997 }),
      false,
    );
    assert.equal(
      hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc", releaseYear: null }),
      false,
    );
  });

  it("resolves VHS frame only for films for now", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "film", mediaCarrierCode: "vhs" }),
      {
        assetPath: "/mediaCarriers/video/vhs.png",
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
    assert.equal(hasMediaCarrierFrame({ mediaType: "anime", mediaCarrierCode: "vhs" }), false);
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
  });
});
