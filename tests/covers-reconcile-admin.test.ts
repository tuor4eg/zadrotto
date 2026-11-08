import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobPayloadFields } from "../src/app/admin/(protected)/tools/jobs/job-payload-fields";
import { getJobProgress } from "../src/lib/jobs/progress";
import { getJobManualPlacement } from "../src/lib/jobs/catalog";
import { parseCoverReconcilePayload } from "../src/lib/covers/reconcile-model";

function render(initialPayload: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(JobPayloadFields, {
    type: "media.covers-reconcile", initialPayload,
    mediaTypes: [{ code: "series", name: "Сериалы" }],
  }));
}
function submittedPayload(html: string) {
  const value = html.match(/name="payload" value="([^"]*)"/)?.[1];
  assert.ok(value);
  return parseCoverReconcilePayload(JSON.parse(value.replaceAll("&quot;", '"').replaceAll("&amp;", "&")));
}

test("cover audit form submits safe defaults and includes seasons by default", () => {
  assert.equal(getJobManualPlacement("media.covers-reconcile"), "general");
  const html = render();
  const payload = submittedPayload(html);
  assert.equal(payload.mode, "audit");
  assert.equal(payload.includeParts, true);
  assert.equal(payload.includeEmpty, false);
  assert.equal(payload.allowReplacement, false);
  assert.equal(payload.batchSize, 25);
  assert.match(html, /value="audit" selected=""/);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /Сериалы/);
  assert.doesNotMatch(html, /name="checkpoint"/);
});

test("cover repair form preserves filters and explicit opt-ins", () => {
  const payload = { mode: "repair", includeParts: false, includeEmpty: true, allowReplacement: true, mediaType: "series", mediaItemId: 42, batchSize: 100 };
  const html = render(payload);
  assert.deepEqual(submittedPayload(html), payload);
  assert.match(html, /value="repair" selected=""/);
  assert.match(html, /value="series" selected=""/);
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
});


test("cover progress reports checked objects and both phases without a cursor percentage", () => {
  const counters = { checked: 7, healthy: 2, missingOriginal: 3, missingThumbnail: 4, empty: 1, restored: 2, replaced: 1, skipped: 1, failed: 1, external: 1 };
  const payload = { checkpoint: { phase: "media-items", afterId: 9000, throughMediaItemId: 10000, throughPartId: 50000, counters } };
  const progress = getJobProgress("media.covers-reconcile", payload);
  assert.equal(progress.done, 7);
  assert.equal(progress.total, null);
  assert.equal(progress.percent, null);
  assert.equal(progress.stage, "Обложки записей");
  assert.deepEqual(progress.stats, [
    { label: "Проверено", value: 7 }, { label: "Исправных", value: 2 }, { label: "Нет оригинала", value: 3 },
    { label: "Нет миниатюры", value: 4 }, { label: "Без обложки", value: 1 }, { label: "Восстановлено", value: 2 },
    { label: "Заменено", value: 1 }, { label: "Пропущено", value: 1 }, { label: "Ошибок", value: 1 }, { label: "Внешние ссылки", value: 1 },
  ]);
  assert.equal(getJobProgress("media.covers-reconcile", { checkpoint: { phase: "title-parts", counters } }).stage, "Обложки частей");
  const invalid = getJobProgress("media.covers-reconcile", { checkpoint: { phase: "unknown", counters: { checked: -1, failed: "3", healthy: 0 } } });
  assert.equal(invalid.done, null);
  assert.equal(invalid.stage, null);
  assert.deepEqual(invalid.stats, [{ label: "Исправных", value: 0 }]);
});

test("creator image audit form submits safe defaults and preserves a targeted repair", async () => {
  const { parseCreatorImagesReconcilePayload } = await import("../src/lib/covers/creator-images-reconcile-model");
  const creatorForm = (initialPayload: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(JobPayloadFields, { type: "media.creator-images-reconcile", initialPayload }));
  const formPayload = (html: string) => {
    const value = html.match(/name="payload" value="([^"]*)"/)?.[1];
    assert.ok(value);
    return parseCreatorImagesReconcilePayload(JSON.parse(value.replaceAll("&quot;", '"').replaceAll("&amp;", "&")));
  };
  assert.equal(getJobManualPlacement("media.creator-images-reconcile"), "general");
  const audit = creatorForm();
  const defaults = formPayload(audit);
  assert.equal(defaults.mode, "audit");
  assert.equal(defaults.batchSize, 25);
  assert.equal(defaults.scope, "all");
  assert.equal(defaults.creatorId, undefined);
  assert.match(audit, /value="audit" selected=""/);
  assert.doesNotMatch(audit, /type="checkbox"|name="checkpoint"/);
  const payload = { mode: "repair", batchSize: 100, creatorId: 42 };
  const repair = creatorForm(payload);
  assert.deepEqual(formPayload(repair), { ...payload, scope: "creators" });
  assert.match(repair, /value="creators" selected=""/);
  assert.match(repair, /ID создателя/);
  assert.doesNotMatch(repair, /ID платформы/);
  const platform = creatorForm({ mode: "repair", scope: "platforms", platformId: 12 });
  assert.deepEqual(formPayload(platform), { mode: "repair", batchSize: 25, scope: "platforms", platformId: 12 });
  assert.match(platform, /value="platforms" selected=""/);
  assert.match(platform, /ID платформы/);
  assert.doesNotMatch(platform, /ID создателя/);
  assert.match(repair, /value="repair" selected=""/);
});

test("creator image progress exposes only known counters without an ID percentage", () => {
  const progress = getJobProgress("media.creator-images-reconcile", { checkpoint: { afterId: 100, throughId: 9000, counters: { checked: 7, healthy: 2, missing: 3, restored: 2, skipped: 1, failed: 1, secret: 9 } } });
  assert.equal(progress.done, 7);
  assert.equal(progress.total, null);
  assert.equal(progress.percent, null);
  assert.equal(progress.stage, "Фотографии и логотипы создателей");
  assert.equal(getJobProgress("media.creator-images-reconcile", { checkpoint: { phase: "platforms", counters: { checked: 3 } } }).stage, "Логотипы платформ");
  assert.deepEqual(progress.stats, [
    { label: "Проверено", value: 7 }, { label: "Исправных", value: 2 }, { label: "Нет изображения", value: 3 },
    { label: "Восстановлено", value: 2 }, { label: "Пропущено", value: 1 }, { label: "Ошибок", value: 1 },
  ]);
});
