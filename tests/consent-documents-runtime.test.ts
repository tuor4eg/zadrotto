import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sandboxModule = { exports: {} as T };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return sandboxModule.exports;
}
const jsx = (type: unknown, props: unknown) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: "fragment" };

test("document routes deny direct access while off and restore access when enabled", async () => {
  let enabled = false;
  let headersRead = 0;
  const dependencies = {
    "react/jsx-runtime": runtime, "next/link": { default: "link" },
    "next/navigation": { notFound: () => { throw new Error("404"); } },
    "@/components/archive/public-site-header": { PublicSiteHeader: "header" },
    "@/lib/archive/public-site-header": { getPublicSiteHeaderState: async () => { headersRead++; return { headerProps: {} }; } },
    "@/db/queries/personal-data-consent": { isPersonalDataConsentRequired: async () => enabled, getPersonalDataConsentSettings: async () => ({ requireConsent: enabled, operatorDetails: "", contact: "" }) },
    "@/lib/privacy/consent": { CURRENT_CONSENT_VERSION: "test" },
  };
  const consent = load<typeof import("../src/app/consent/page")>("src/app/consent/page.tsx", dependencies);
  const privacy = load<typeof import("../src/app/privacy/page")>("src/app/privacy/page.tsx", dependencies);
  await assert.rejects(consent.default(), /404/);
  await assert.rejects(privacy.default(), /404/);
  assert.equal(headersRead, 0);
  enabled = true;
  assert.ok(await consent.default());
  assert.ok(await privacy.default());
  assert.equal(headersRead, 2);
});

test("footer removes both document links while the same server requirement is off", () => {
  let enabled = false;
  const footer = load<typeof import("../src/components/archive/archive-site-footer")>("src/components/archive/archive-site-footer.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "link" },
    "@/lib/privacy/use-consent-requirement": { useConsentRequirement: () => enabled },
    "@/components/archive/analytics-settings-button": { AnalyticsSettingsButton: "button" },
  });
  const hrefs = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(hrefs);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const { props } = node as { props: { href?: string; children?: unknown } };
    return [...(props.href ? [props.href] : []), ...hrefs(props.children)];
  };
  const hidden = hrefs(footer.ArchiveSiteFooter());
  assert.equal(hidden.includes("/consent"), false);
  assert.equal(hidden.includes("/privacy"), false);
  assert.ok(hidden.includes("/help"));
  enabled = true;
  const visible = hrefs(footer.ArchiveSiteFooter());
  assert.ok(visible.includes("/consent"));
  assert.ok(visible.includes("/privacy"));
});
