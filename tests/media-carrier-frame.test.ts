import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getMediaCarrierFrame, hasMediaCarrierFrame } from "@/lib/media/carrier-frame";

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
        renderKind: "cartridge",
      },
    );
  });

  it("keeps unknown carriers and empty carrier values frameless", () => {
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc" }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: null }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: null, mediaCarrierCode: "nes" }), false);
  });
});
