import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const admin = "src/app/admin/(protected)";

test("replacement genre tab survives search and pagination", () => {
  const search = source(`${admin}/genres/genre-search.tsx`);
  const page = source(`${admin}/genres/page.tsx`);
  assert.match(search, /if \(series\) params\.set\("tab", "series"\)/);
  assert.match(page, /GenreSearch searchQuery=\{searchQuery\} series=\{series\}/);
  assert.match(page, /const pageUrl[^\n]*series \? \{ tab: "series" \}[^\n]*q: searchQuery[^\n]*page: String\(page\)/);
  assert.match(page, /href=\{pageUrl\(result\.page - 1\)\}/);
  assert.match(page, /href=\{pageUrl\(result\.page \+ 1\)\}/);
});

test("genre form allows clearing replacement and rejects invalid series on the server", () => {
  const form = source(`${admin}/genres/genre-form.tsx`);
  const action = source(`${admin}/genres/actions.ts`);
  assert.match(form, /name="replacementFranchiseId"/);
  assert.match(form, /emptyLabel="Без замены"/);
  assert.match(action, /rawReplacementFranchiseId === "" \? null : parseGenreId\(rawReplacementFranchiseId\)/);
  assert.match(action, /rawReplacementFranchiseId !== "" && replacementFranchiseId === null/);
  assert.match(action, /await updateGenre\(id, name, replacementFranchiseId\)/);
  assert.match(action, /error\.message === "invalid-series"\) redirect\([^\n]*error=invalid-series/);
});

test("missing series filter persists in pagination and export and is removed by reset", () => {
  const page = source(`${admin}/media/page.tsx`);
  const filters = source(`${admin}/media/media-filters-form.tsx`);
  assert.match(page, /const paginationSearchParams = \{[^}]*seriesBinding: seriesBinding \?\? undefined/s);
  assert.match(page, /seriesBinding \? \{ seriesBinding \} : \{\}/);
  assert.match(filters, /updateFilterParam\(nextSearchParams, "seriesBinding", nextFilters\.seriesBinding \?\? "", ""\)/);
  assert.match(filters, /function resetFilters\(\)[\s\S]*?router\.replace\(pathname, \{ scroll: false \}\)/);
  const create = source("src/lib/admin-exports/create.ts");
  assert.match(create, /value\.seriesBinding === "missing" \? \{ seriesBinding: value\.seriesBinding \} : \{\}/);
  for (const path of ["src/lib/admin-exports/generate.ts", "src/db/queries/media-items.ts"]) {
    assert.match(source(path), /seriesBinding === "missing"\) conditions\.push\(missingGenreSeriesBindingSql\(\)\)/);
  }
});

test("public record projections hide replacement genres while edit and metadata retain raw genres", () => {
  const items = source("src/db/queries/media-items.ts");
  for (const name of ["getAuthorMediaItemForEdit", "getAdminMediaItemForEdit"]) {
    const body = items.split(`export async function ${name}(`)[1].split("export async function")[0];
    assert.match(body, /genres: mediaItemGenresJsonSql\(\)/);
    assert.doesNotMatch(body, /publicMediaItemGenresJsonSql\(/);
  }
  for (const name of ["getPublicMediaItemMetadataByCode", "getMediaItemByCode"]) {
    const body = items.split(`export async function ${name}(`)[1].split("export async function")[0];
    assert.match(body, /genres: publicMediaItemGenresJsonSql\(\)/);
  }
  assert.match(source("src/db/queries/media-item-tiles.ts"), /genres: publicMediaItemGenresJsonSql\(\)/);
  assert.match(source("src/db/queries/media-item-metadata.ts"), /genres: mediaItemGenresJsonSql\(mediaItemMetadata\.mediaItemId\)/);
});
