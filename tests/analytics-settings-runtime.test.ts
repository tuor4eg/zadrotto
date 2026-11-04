import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { OPEN_ANALYTICS_SETTINGS_EVENT } from "../src/lib/analytics/consent";

for (const enabled of [false, true]) {
test(`Analytics flag (${enabled}) overrides stored consent and controls Cookies`, async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let mounted = false;
  const effects: (() => void)[] = [];
  const events = new EventTarget();
  const source = readFileSync("src/components/archive/analytics-consent-layer.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  type Element = { type: unknown; props: { children?: unknown; [key: string]: unknown } };
  const jsx = (type: unknown, props: Element["props"]) => ({ type, props });
  const sandboxModule = { exports: {} as { AnalyticsConsentLayer: () => Element } };
  vm.runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports,
    window: {
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      localStorage: { getItem: () => { if (!enabled) return "granted"; throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
      location: { hostname: "localhost", reload: () => {} },
    },
    document: { cookie: "" }, queueMicrotask,
    fetch: async () => ({ ok: true, json: async () => ({ measurementId: null }) }),
    require: (name: string) => {
      if (name === "@/lib/privacy/use-consent-requirement") return { useConsentRequirement: () => false };
      if (name === "./analytics-config-provider") return { useAnalyticsConfig: () => ({ enabled, measurementId: enabled ? null : "G-TEST", isReady: true }) };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "react") return {
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!mounted) states[index] = initial;
          return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
        },
        useEffect: (effect: () => void) => { if (!mounted) effects.push(effect); },
      };
      if (name === "@/lib/analytics/consent") return { OPEN_ANALYTICS_SETTINGS_EVENT };
      return { Button: "button", X: "icon", default: "link", GoogleAnalytics: "analytics" };
    },
  });
  const render = () => { cursor = 0; return sandboxModule.exports.AnalyticsConsentLayer(); };
  const initial = render(); mounted = true;
  for (const effect of effects) effect();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const find = (node: unknown, predicate: (element: Element) => boolean): Element | undefined => {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object" || !("props" in node)) return undefined;
    const element = node as Element;
    return predicate(element) ? element : find(element.props.children, predicate);
  };
  assert.equal(find(initial, (element) => element.props.role === "dialog"), undefined);
  events.dispatchEvent(new Event(OPEN_ANALYTICS_SETTINGS_EVENT));
  const open = render();
  assert.equal(find(open, (element) => element.props.href === "/privacy"), undefined);
  if (!enabled) {
    assert.equal(find(open, (element) => element.props.role === "dialog"), undefined);
    assert.equal(find(open, (element) => element.type === "analytics"), undefined);
    return;
  }
  assert.ok(find(open, (element) => element.props.role === "dialog"));
  assert.equal(find(open, (element) => element.props.children === "Разрешить аналитику")?.props.disabled, true);
  const deny = find(open, (element) => element.props.children === "Только необходимые");
  assert.ok(deny);
  (deny.props.onClick as () => void)();
  assert.equal(find(render(), (element) => element.props.role === "dialog"), undefined);
});

}
