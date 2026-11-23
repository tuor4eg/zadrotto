import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { it } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

it("requires an admin session before searching or mutating sources", async () => {
  // Next installs this global when bootstrapping the server.
  Object.defineProperty(globalThis, "AsyncLocalStorage", { value: AsyncLocalStorage, configurable: true });
  const [{ workAsyncStorage }, { saveEntrySourcesAction, saveWorksBasedOnAction }, { GET }] = await Promise.all([
    import("next/dist/server/app-render/work-async-storage.external"),
    import("../src/app/admin/(protected)/media/[id]/edit/entry-source-actions"),
    import("../src/app/api/admin/entry-sources/search/route"),
  ]);
  // Next's static request context supplies an empty cookie store without a running app.
  await workAsyncStorage.run({ forceStatic: true } as WorkStore, async () => {
    const response = await GET(new Request("http://localhost/api/admin/entry-sources/search?type=creator&entry=1&q=writer"));
    assert.equal(response.status, 401);
    for (const action of [saveEntrySourcesAction, saveWorksBasedOnAction]) {
      await assert.rejects(action(1, { message: "" }, new FormData()), {
        digest: "NEXT_REDIRECT;replace;/admin/login;307;",
      });
    }
  });
});
