import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthorDigitalProfile } from "@/db/queries/author-digital-profile";
import {
  getAuthorResearchMessage,
  MATURE_AUTHOR_RESEARCH_RATINGS_COUNT,
} from "@/lib/main-page/author-research-message";

const completeProfile: AuthorDigitalProfile = {
  activeSeries: { id: 2, code: "firefly", title: "Светлячок" },
  bestKnownType: { code: "film", name: "Фильмы" },
  seriesRated: 2,
  seriesTotal: 4,
  strongestSeries: { id: 2, code: "firefly", title: "Светлячок" },
  strongestSeriesCount: 2,
  unexploredType: { code: "book", name: "Книги" },
};

const emptyProfile: AuthorDigitalProfile = {
  activeSeries: null,
  bestKnownType: null,
  seriesRated: 0,
  seriesTotal: 0,
  strongestSeries: null,
  strongestSeriesCount: 0,
  unexploredType: null,
};

function buildInput(overrides: Partial<Parameters<typeof getAuthorResearchMessage>[0]> = {}) {
  return {
    authorId: 1,
    averageScore: 7.4,
    contributionCount: 1,
    digitalProfile: completeProfile,
    ratingsCount: 10,
    reviewCount: 1,
    ...overrides,
  };
}

describe("author research message", () => {
  it("keeps archives below 25 ratings in cautious early scenarios", () => {
    for (let authorId = 1; authorId <= 20; authorId += 1) {
      const message = getAuthorResearchMessage(buildInput({ authorId }));
      assert.equal(message.maturity, "early");
      assert.match(message.key, /^early-/);
      assert.doesNotMatch(`${message.title} ${message.body}`, /обрёл характер/);
    }

    assert.equal(MATURE_AUTHOR_RESEARCH_RATINGS_COUNT, 25);
  });

  it("enables mature analytical scenarios exactly at the threshold", () => {
    const messages = Array.from({ length: 20 }, (_, index) => getAuthorResearchMessage(
      buildInput({ authorId: index + 1, ratingsCount: 25 }),
    ));

    assert.ok(messages.every((message) => message.maturity === "mature"));
    assert.ok(messages.every((message) => message.key.startsWith("mature-")));
    assert.ok(messages.some((message) => message.cta.href === "/series/firefly"));
    assert.ok(messages.some((message) => message.cta.href === "/archive?type=film"));
  });

  it("only offers scenarios supported by available profile data", () => {
    const message = getAuthorResearchMessage(buildInput({
      authorId: 9,
      contributionCount: 0,
      digitalProfile: emptyProfile,
      ratingsCount: 3,
      reviewCount: 0,
    }));

    assert.equal(message.key, "early-progress");
    assert.equal(message.cta.href, "/archive");
    assert.doesNotMatch(message.body, /null|undefined/);
  });

  it("does not mention zero ratings when another contribution opens the widget", () => {
    const message = getAuthorResearchMessage(buildInput({
      authorId: 4,
      averageScore: null,
      contributionCount: 0,
      digitalProfile: emptyProfile,
      ratingsCount: 0,
      reviewCount: 1,
    }));

    assert.doesNotMatch(message.body, /0 оцен/);
    assert.match(message.key, /^early-/);
  });

  it("returns the same message for the same state and varies across eligible states", () => {
    const input = buildInput();
    assert.deepEqual(getAuthorResearchMessage(input), getAuthorResearchMessage(input));

    const keys = new Set(Array.from({ length: 12 }, (_, index) => (
      getAuthorResearchMessage(buildInput({ authorId: index + 1 })).key
    )));
    assert.ok(keys.size > 1);
  });
});
