import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getMediaCarrierFrame, hasMediaCarrierFrame } from "@/lib/media-carrier-frame";

describe("media carrier frames", () => {
  it("resolves NES cartridge frame by media type and carrier code", () => {
    assert.deepEqual(
      getMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "nes" }),
      {
        assetPath: "/mediaCarriers/game/nes/cartridge.png",
        displayFontClassName: "media-carrier-font-nes",
        fontClassName: "media-carrier-font-nes",
        labelFontClassName: "media-carrier-font-nes",
        renderKind: "nes-cartridge",
      },
    );
  });

  it("keeps unknown carriers and empty carrier values frameless", () => {
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: "pc" }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: "game", mediaCarrierCode: null }), false);
    assert.equal(hasMediaCarrierFrame({ mediaType: null, mediaCarrierCode: "nes" }), false);
  });
});
