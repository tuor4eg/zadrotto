import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sandboxModule = { exports: {} as T };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Response, ...globals,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return sandboxModule.exports;
}

test("config suppresses ID while off and admin action requires authorization", async () => {
  let enabled = false;
  let writes = 0;
  const route = load<typeof import("../src/app/api/analytics-config/route")>("src/app/api/analytics-config/route.ts", {
    "@/db/queries/analytics-settings": { getAnalyticsSettings: async () => ({ enabled }) },
    "@/lib/analytics/google-analytics": { getGoogleAnalyticsId: () => { assert.equal(enabled, true); return "G-TEST"; } },
  });
  assert.deepEqual(await (await route.GET()).json(), { enabled: false, measurementId: null });
  enabled = true;
  assert.deepEqual(await (await route.GET()).json(), { enabled: true, measurementId: "G-TEST" });
  let authorized = false;
  const actions = load<typeof import("../src/app/admin/(protected)/tools/statistics/actions")>("src/app/admin/(protected)/tools/statistics/actions.ts", {
    "@/lib/auth/admin-auth": { requireAdminUser: async () => { if (!authorized) throw new Error("unauthorized"); } },
    "@/db/queries/analytics-settings": { saveAnalyticsSettings: async (value: boolean) => { enabled = value; writes++; } },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: () => { throw new Error("redirect"); } },
  });
  await assert.rejects(actions.saveAnalyticsSettingsAction(new FormData()), /unauthorized/);
  assert.equal(writes, 0);
  authorized = true;
  await assert.rejects(actions.saveAnalyticsSettingsAction(new FormData()), /redirect/);
  assert.equal(enabled, false);
});

test("provider stops previously available GA and reloads when the flag is disabled", async () => {
  let enabled = true;
  let reloads = 0;
  const events = new EventTarget();
  const effects: (() => void)[] = [];
  const updates: { enabled: boolean }[] = [];
  const browser: Record<string, unknown> = {
    location: { reload: () => { reloads++; } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    setInterval: () => 1, clearInterval: () => {},
  };
  const provider = load<typeof import("../src/components/archive/analytics-config-provider")>("src/components/archive/analytics-config-provider.tsx", {
    "react/jsx-runtime": { jsx: () => null }, "next/navigation": { usePathname: () => "/archive" },
    react: { createContext: () => ({}), useState: (value: unknown) => [value, (next: { enabled: boolean }) => updates.push(next)], useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => void) => effects.push(effect) },
  }, { window: browser, fetch: async () => ({ ok: true, json: async () => ({ enabled, measurementId: enabled ? "G-TEST" : null }) }) });
  provider.AnalyticsConfigProvider({ children: null });
  effects.forEach((effect) => effect());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(updates.at(-1)?.enabled, true);
  enabled = false;
  events.dispatchEvent(new Event("focus"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(browser["ga-disable-G-TEST"], true);
  assert.equal(reloads, 1);
  assert.equal(updates.at(-1)?.enabled, false);
});

test("footer Cookies control is absent when statistics are disabled", () => {
  let enabled = false;
  const button = load<typeof import("../src/components/archive/analytics-settings-button")>("src/components/archive/analytics-settings-button.tsx", {
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    "./analytics-config-provider": { useAnalyticsConfig: () => ({ enabled }) },
    "@/lib/analytics/consent": { OPEN_ANALYTICS_SETTINGS_EVENT: "open-settings" },
  });
  assert.equal(button.AnalyticsSettingsButton(), null);
  enabled = true;
  assert.ok(button.AnalyticsSettingsButton());
});
