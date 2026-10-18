import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePlatformRequestDecision } from "../src/lib/media/platform-request-form";
import { PlatformRequestsList } from "../src/app/admin/(protected)/platform-requests/request-list";
import { PlatformRequestDecisionForm } from "../src/app/admin/(protected)/platform-requests/decision-form";
import { platformRequestError } from "../src/app/admin/(protected)/platform-requests/presentation";
import type { PlatformRequestListItem } from "../src/db/queries/platform-requests";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  return data;
}

describe("platform request decisions", () => {
  it("validates each decision and retains only its relevant fields", () => {
    assert.deepEqual(parsePlatformRequestDecision(form({ requestId: "1", decision: "create", name: "  PC  ", slug: "changed", platformIds: "999" })), { requestId: 1, decision: "create", name: "PC" });
    assert.deepEqual(parsePlatformRequestDecision(form({ requestId: "2", decision: "map", platformIds: ["3", "4", "3"] })), { requestId: 2, decision: "map", platformIds: [3, 4] });
    assert.deepEqual(parsePlatformRequestDecision(form({ requestId: "3", decision: "exclude", name: "ignored" })), { requestId: 3, decision: "exclude" });
    for (const values of [
      { requestId: "0", decision: "exclude" }, { requestId: "1e2", decision: "exclude" }, { requestId: "2147483648", decision: "exclude" },
      { requestId: "1", decision: "delete" }, { requestId: "1", decision: "create", name: " \t" },
      { requestId: "1", decision: "map" }, { requestId: "1", decision: "map", platformIds: ["2", "bad"] },
    ]) assert.equal(parsePlatformRequestDecision(form(values)), null);
  });
  it("renders multiple choices without a slug field", () => {
    const html = renderToStaticMarkup(createElement(PlatformRequestDecisionForm, { requestId: 1,
      platforms: [{ id: 10, name: "PC", slug: "drama" }, { id: 11, name: "Mac", slug: "comedy" }], action: async () => {} }));
    for (const text of ["Создать нашу платформу", "Связать с существующими", "Не считать платформой", "PC", "Mac"]) assert.ok(html.includes(text));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /name="slug"|>drama<|>comedy</);
  });
});

describe("platform request administrative display", () => {
  const request = { id: 1, provider: "igdb", mediaType: "game", mediaTypeName: "Игра", externalPlatformName: "Новая платформа", normalizedExternalPlatformName: "новая платформа",
    occurrenceCount: 3, status: "pending", decision: null, firstSeenAt: new Date("2026-10-05T10:00:00Z"), lastSeenAt: new Date(), resolvedAt: null,
    resolvedByAdminId: null, jobRunId: null, jobError: null } satisfies PlatformRequestListItem;
  it("shows the same provider/type, count, platform and status on desktop and mobile", () => {
    const html = renderToStaticMarkup(createElement(PlatformRequestsList, { requests: [request] }));
    for (const text of ["Новая платформа", "IGDB", "Игра", "Ожидает решения"]) assert.equal(html.split(text).length - 1, 2);
    assert.match(html, /md:hidden/);
    assert.match(html, /hidden md:block/);
    assert.equal((html.match(/href="\/admin\/platform-requests\/1"/g) ?? []).length, 2);
  });
  it("defaults to pending requests and makes processed and failed requests discoverable", () => {
    assert.match(renderToStaticMarkup(createElement(PlatformRequestsList, { requests: [] })), /Нет платформ, ожидающих решения/);
    const page = readFileSync("src/app/admin/(protected)/platform-requests/page.tsx", "utf8");
    assert.match(page, /query.tab === "all"/);
    assert.match(page, /getPlatformRequestsPage\(\{ all, searchQuery, page:/);
    assert.match(page, /Ожидают решения/);
    assert.match(page, /Все заявки/);
    assert.match(page, /PlatformRequestSearch/);
    assert.match(page, /pageUrl\(result.page/);
    assert.match(platformRequestError("already-resolved")!, /Другой администратор/);
  });
  it("links failed and processed requests to their details, where failed decisions can be retried", () => {
    for (const status of ["failed", "processed"] as const) {
      const html = renderToStaticMarkup(createElement(PlatformRequestsList, { requests: [{ ...request, status, decision: "map" }], all: true }));
      assert.equal((html.match(/href="\/admin\/platform-requests\/1"/g) ?? []).length, 2);
      assert.match(html, status === "failed" ? /Ошибка применения/ : /Обработана/);
    }
    const detail = readFileSync("src/app/admin/(protected)/platform-requests/[id]/page.tsx", "utf8");
    assert.match(detail, /request.status === "failed"/);
    assert.match(detail, /action={retryPlatformRequestAction}/);
    assert.match(renderToStaticMarkup(createElement(PlatformRequestsList, { requests: [], all: true })), /Заявок на платформы пока нет/);
    assert.match(renderToStaticMarkup(createElement(PlatformRequestsList, { requests: [], searching: true })), /Заявки не найдены/);
  });
  it("authenticates both actions before reading input and has guarded detail routes", () => {
    const actions = readFileSync("src/app/admin/(protected)/platform-requests/actions.ts", "utf8");
    for (const section of actions.split("export async function").slice(1)) assert.ok(section.indexOf("requireAdminUser()") < section.indexOf('formData.get("requestId")'));
    const page = readFileSync("src/app/admin/(protected)/platform-requests/[id]/page.tsx", "utf8");
    assert.match(page, /if \(!id\) notFound\(\)/);
    assert.match(page, /if \(!detail\) notFound\(\)/);
    const nav = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");
    assert.match(nav, /href: "\/admin\/platform-requests".*count: pendingPlatformRequestsCount/);
  });
});
