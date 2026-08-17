import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getMediaTitleCandidateFormFields } from "../src/lib/media/title-candidate-form";
import type { MediaTitleCandidate } from "../src/lib/covers/types";

const candidate: MediaTitleCandidate = {
  id: "tmdb:123",
  provider: "tmdb",
  externalId: "123",
  mediaType: "movie",
  title: "Название провайдера",
  originalTitle: "Provider title",
  description: "Описание провайдера",
  coverUrl: null,
  sourcePageUrl: null,
  releaseYear: 1999,
};

describe("getMediaTitleCandidateFormFields", () => {
  it("fully applies the candidate in create mode", () => {
    assert.deepEqual(
      getMediaTitleCandidateFormFields(
        candidate,
        {
          title: "Текущее название",
          originalTitle: "Current title",
          description: "Текущее описание",
          releaseYear: "2001",
        },
        false,
      ),
      {
        title: "Название провайдера",
        originalTitle: "Provider title",
        description: "Описание провайдера",
        releaseYear: "1999",
      },
    );
  });

  it("fills empty fields from the candidate in edit mode", () => {
    assert.deepEqual(
      getMediaTitleCandidateFormFields(
        candidate,
        { title: "", originalTitle: "", description: "", releaseYear: "" },
        true,
      ),
      {
        title: "Название провайдера",
        originalTitle: "Provider title",
        description: "Описание провайдера",
        releaseYear: "1999",
      },
    );
  });

  it("preserves non-empty fields exactly and treats whitespace-only fields as empty", () => {
    assert.deepEqual(
      getMediaTitleCandidateFormFields(
        candidate,
        {
          title: "  Моё название  ",
          originalTitle: "   ",
          description: "  Моё описание\n",
          releaseYear: "\t",
        },
        true,
      ),
      {
        title: "  Моё название  ",
        originalTitle: "Provider title",
        description: "  Моё описание\n",
        releaseYear: "1999",
      },
    );
  });

  it("maps nullable optional candidate fields to empty strings", () => {
    assert.deepEqual(
      getMediaTitleCandidateFormFields(
        {
          ...candidate,
          originalTitle: null,
          description: null,
          releaseYear: null,
        },
        { title: "", originalTitle: "", description: "", releaseYear: "" },
        false,
      ),
      {
        title: "Название провайдера",
        originalTitle: "",
        description: "",
        releaseYear: "",
      },
    );
  });
});

describe("explicit provider title search applies candidate fields even when editing", () => {
  it("does not preserve existing form fields after picking a candidate", () => {
    const adminForm = readFileSync("src/app/admin/(protected)/media/media-form.tsx", "utf8");
    const authorForm = readFileSync("src/app/author/(protected)/media/media-item-form.tsx", "utf8");

    for (const source of [adminForm, authorForm]) {
      assert.match(
        source,
        /getMediaTitleCandidateFormFields\(\s*candidate,[\s\S]*?false,\s*\)/,
      );
      assert.match(
        source,
        /getMediaTitleMetadataFormFields\(\s*result\.metadata\.fields,[\s\S]*?false,\s*\)/,
      );
    }
  });
});
