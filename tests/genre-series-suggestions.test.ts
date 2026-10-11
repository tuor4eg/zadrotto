import assert from "node:assert/strict";
import { test } from "node:test";
import { appendGenreSeriesSuggestions, getAvailableGenreSeriesSuggestions } from "../src/lib/media/genre-series-suggestions";
import type { SearchableFranchiseOption } from "../src/components/ui/searchable-franchise-select";

const options: SearchableFranchiseOption[] = [
  { id: 1, title: "Научная фантастика", originalTitle: null, publicationStatus: "published" },
  { id: 2, title: "Дикий запад", originalTitle: null, publicationStatus: "published" },
  { id: 3, title: "На проверке", originalTitle: null, publicationStatus: "submitted" },
  { id: 4, title: "Недоступная", originalTitle: null, publicationStatus: "published", disabled: true },
];

test("genre series suggestions deduplicate and exclude selected, unavailable and unpublished series", () => {
  assert.deepEqual(getAvailableGenreSeriesSuggestions([1, 1, 2, 3, 4, 999], options, ["2"]).map(series => series.id), [1]);
  assert.deepEqual(getAvailableGenreSeriesSuggestions([], options, []), []);
  assert.deepEqual(getAvailableGenreSeriesSuggestions([1, 2], options, ["1", "2"]), []);
});

test("provider metadata adds related series immediately and preserves manual selections without duplicates", () => {
  const selected = ["2", "99"];
  assert.deepEqual(appendGenreSeriesSuggestions(selected, [1, 1, 2, 3, 4], options), ["2", "99", "1"]);
  assert.deepEqual(selected, ["2", "99"]);
  assert.equal(appendGenreSeriesSuggestions(selected, [2, 3, 4], options), selected);
  assert.equal(appendGenreSeriesSuggestions(selected, [], options), selected);
});
