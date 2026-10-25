import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { creatorDateLabels, creatorEditErrorMessage } from "../src/lib/creators/editor";
import { planCreatorLifeDates } from "../src/lib/creators/life-dates";

test("organization dates have lifecycle labels and are never populated from person profiles", () => {
  assert.deepEqual(creatorDateLabels("organization"), { start: "Дата создания", end: "Дата закрытия" });
  assert.equal(creatorDateLabels("person").start, "Дата рождения");
  assert.deepEqual(planCreatorLifeDates({ typeCode: "organization", isPseudonym: false, birthDate: null, deathDate: null }, { birthDate: "2000-01-01", deathDate: "2020-01-01" }).changes, {});
  assert.match(creatorEditErrorMessage("type-in-use"), /привязками/);
});

test("editor loads one Creator and initial pseudonym selections instead of the whole catalog", () => {
  const source = readFileSync("src/db/queries/creators.ts", "utf8");
  const byId = source.slice(source.indexOf("export async function getAdminCreatorById"), source.indexOf("export async function getEntryCreators"));
  assert.doesNotMatch(byId, /getAdminCreators\(|getCreatorOptions\(/);
  assert.match(byId, /where\(eq\(creators.id, id\)\)/);
  const form = readFileSync("src/app/admin/(protected)/creators/creator-form.tsx", "utf8");
  assert.match(form, /searchCreatorRelationsAction\(creatorSearch, creator\?\.id\)/);
  assert.match(form, /if \(cancelled\) return/);
  assert.match(form, /disabled=\{!datesEnabled\}/);
  assert.match(form, /<input type="hidden" name="relationType" value="pseudonym_of" \/>/);
  assert.ok(form.indexOf('name="relationType"') < form.indexOf('aria-labelledby="creator-relations-heading"'));
});

test("bindings show history and allow reopening FantLab; protected images cannot enqueue a refresh", () => {
  const variants = readFileSync("src/app/admin/(protected)/creators/provider-variants.tsx", "utf8");
  assert.match(variants, /binding.active === false/);
  assert.match(variants, /binding.active !== false && \["bgg", "igdb", "rawg", "tmdb", "fantlab"\]/);
  const page = readFileSync("src/app/admin/(protected)/creators/[id]/edit/page.tsx", "utf8");
  assert.match(page, /getCreatorProviderBindings\(creatorId, true\)/);
  assert.match(page, /Удаление недоступно/);
  assert.match(page, /Привязки к провайдерам/);
  const actions = readFileSync("src/app/admin/(protected)/creators/avatar-actions.ts", "utf8");
  assert.match(actions, /!canWriteCreatorImage\(avatar, source.binding\)/);
  assert.match(actions, /imageRun=\$\{runId\}/);
});
