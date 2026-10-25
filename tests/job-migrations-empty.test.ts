import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

test("migration page stays available with no launch forms after completed transfers are removed", async () => {
  const { default: JobMigrationsPage } = await import("../src/app/admin/(protected)/tools/jobs/migrations/page");
  const html = renderToStaticMarkup(await JobMigrationsPage({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Сейчас нет доступных миграций/);
  assert.doesNotMatch(html, /<form|Запустить перенос|Проверить перенос/);
});
