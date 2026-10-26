import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import Module, { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const saved = new Map<string, NodeModule | undefined>();
let selectedType = "organization";
let peopleSources = false;
let page: typeof import("../src/app/admin/(protected)/creators/[id]/snapshots/page").default;
function mock(path: string, exports: unknown) {
  const key = require.resolve(path);
  saved.set(key, require.cache[key]);
  const mockedModule = new Module(key);
  mockedModule.loaded = true;
  mockedModule.exports = exports;
  require.cache[key] = mockedModule;
}
before(async () => {
  const state = () => ({ id: 7, name: "Studio", typeCode: selectedType, bindings: [], birthDate: null, deathDate: null });
  mock("../src/lib/auth/admin-auth", { requireAdminUser: async () => ({ id: 1 }) });
  mock("../src/db/queries/creator-provider-snapshots", { getCreatorSnapshotComparison: async (_id: number, provider = "fantlab") => ({ state: state(), snapshot: null, projection: peopleSources ? { birthDate: provider === "tmdb" ? "1980-01-01" : "1970-01-01", deathDate: null } : null, changes: peopleSources ? { birthDate: provider === "tmdb" ? "1980-01-01" : "1970-01-01" } : {}, diagnostics: [] }) });
  mock("../src/db/queries/creator-profile-snapshots", { getCreatorProfileSources: async () => ({ creator: state(), sources: peopleSources ? [
    { binding: { id: 21, provider: "fantlab", externalCreatorId: "17" }, target: { provider: "fantlab", resourceType: "author", externalId: "17" }, snapshot: { id: 31, fetchedAt: new Date("2026-10-21T00:00:00Z"), payloadHash: "a".repeat(64), payload: { id: 17, name: "Author" } }, linked: false, canApply: true },
    { binding: { id: 22, provider: "tmdb", externalCreatorId: "person:19" }, target: { provider: "tmdb", resourceType: "person", externalId: "19" }, snapshot: { id: 32, fetchedAt: new Date("2026-10-21T00:00:00Z"), payloadHash: "b".repeat(64), payload: { id: 19, name: "Director" } }, linked: true, canApply: true },
    { binding: { id: 23, provider: "anilist", externalCreatorId: "person:19" }, target: { provider: "anilist", resourceType: "person", externalId: "19" }, snapshot: null, linked: false, canApply: false },
  ] : [
    { binding: { id: 12, provider: "tmdb", externalCreatorId: "company:19" }, target: { provider: "tmdb", resourceType: "company", externalId: "19" }, snapshot: { id: 23, fetchedAt: new Date("2026-10-21T00:00:00Z"), payloadHash: "a".repeat(64), payload: { id: 19, name: "Studio", unknown: true } }, linked: true, canApply: false },
    { binding: { id: 13, provider: "bgg", externalCreatorId: "17" }, target: null, snapshot: null, linked: false, canApply: false },
    { binding: { id: 14, provider: "anilist", externalCreatorId: "studio:19" }, target: null, snapshot: null, linked: false, canApply: false },
  ] }) });
  mock("../src/db/queries/provider-snapshot-run", { getCreatorSnapshotRun: async () => null });
  mock("../src/app/admin/(protected)/tools/providers/snapshots/actions", { enqueueProviderSnapshotAction: () => assert.fail("render must not enqueue"), attachCreatorProfileSnapshotAction: () => assert.fail("render must not mutate") });
  mock("../src/app/admin/(protected)/creators/avatar-actions", { refreshCreatorImageAction: () => assert.fail("render must not refresh images"), findAnimeCompanyLogoAction: () => assert.fail("render must not search companies") });
  mock("../src/app/admin/(protected)/tools/jobs/actions", { cancelJobRunAction: () => assert.fail("render must not cancel") });
  ({ default: page } = await import("../src/app/admin/(protected)/creators/[id]/snapshots/page"));
});
after(() => { for (const [key, old] of saved) { if (old) require.cache[key] = old; else delete require.cache[key]; } });

test("organizations view their full source profile without FantLab date tools", async () => {
  selectedType = "organization";
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({}) }));
  assert.match(html, /Данные источников/);
  assert.match(html, /TMDB.*company:19/);
  assert.match(html, /Посмотреть полный ответ/);
  assert.match(html, /Обновить raw/);
  assert.match(html, /name="bindingId" value="12"/);
  assert.match(html, /Получение профиля этого источника пока не поддерживается/);
  assert.match(html, /Найти логотип в TMDB/);
  assert.match(html, /спорные совпадения появятся в заявках/);
  assert.doesNotMatch(html, /Применение данных FantLab|Сравнение дат жизни|Связать с Creator/);
});


test("person source cards share separate raw, link, comparison, apply and fresh image controls", async () => {
  selectedType = "person";
  peopleSources = true;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({}) }));
  assert.equal((html.match(/Сравнить даты жизни/g) ?? []).length, 2);
  assert.equal((html.match(/Применить даты из raw/g) ?? []).length, 2);
  assert.equal((html.match(/Посмотреть полный ответ/g) ?? []).length, 2);
  assert.equal((html.match(/Краткие данные сравнения/g) ?? []).length, 2);
  assert.equal((html.match(/Обновить изображение из источника/g) ?? []).length, 3);
  assert.match(html, /AniList.*person:19/);
  assert.match(html, /Связать с Creator/);
  assert.match(html, /name="provider" value="fantlab"/);
  assert.match(html, /name="provider" value="tmdb"/);
  assert.match(html, /1970-01-01/);
  assert.match(html, /1980-01-01/);
  assert.match(html, /запрашивает свежий профиль/);
  assert.doesNotMatch(html, /Применение данных FantLab|портрет из raw/);
});
