import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the real hook with deterministic effects and timers, without a browser.
function createSearch() {
  const slots: { current?: unknown; value?: unknown; dependencies?: unknown[]; cleanup?: unknown }[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const calls: string[] = [];
  const react = {
    useRef(value: unknown) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useState(value: unknown) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, (next: unknown) => { slots[index].value = next; }];
    },
    useCallback(callback: unknown) { cursor++; return callback; },
    useEffectEvent(callback: unknown) { cursor++; return callback; },
    useEffect(callback: () => unknown, dependencies: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies?.[i])) {
        effects.push(() => {
          if (typeof previous?.cleanup === "function") previous.cleanup();
          slots[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const exports = {} as {
    useDebouncedSearchDraft(options: { searchQuery: string; onSearch: (query: string) => void }): {
      draft: string; setDraft: (query: string) => void;
    };
  };
  const source = ts.transpileModule(readFileSync("src/lib/common/use-debounced-search-draft.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: () => react,
    window: {
      setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id: number) { timers.delete(id); },
    },
  });
  return {
    calls,
    render(searchQuery: string) {
      cursor = 0;
      effects = [];
      const result = exports.useDebouncedSearchDraft({ searchQuery, onSearch: (q: string) => calls.push(q) });
      effects.forEach((effect) => effect());
      return result;
    },
    flush() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((callback) => callback());
    },
  };
}

it("accepts link navigation while an edited search is still pending", () => {
  const search = createSearch();
  search.render("kare").setDraft("kare kano");
  search.render("kare");
  search.render("");
  search.flush();
  assert.deepEqual(search.calls, []);
  assert.equal(search.render("").draft, "");
});

it("does not restore an old search after its latest query was confirmed", () => {
  const search = createSearch();
  search.render("").setDraft("kar");
  search.render("");
  search.flush();
  search.render("").setDraft("kare");
  search.render("");
  search.flush();
  search.render("kare");
  search.render("");
  search.render("");
  search.flush();
  assert.deepEqual(search.calls, ["kar", "kare"]);
  assert.equal(search.render("").draft, "");
});

it("preserves newer input when a known older search response arrives", () => {
  const search = createSearch();
  search.render("").setDraft("kar");
  search.render("");
  search.flush();
  search.render("").setDraft("kare");
  search.render("");
  search.render("kar");
  assert.equal(search.render("kar").draft, "kare");
  assert.equal(search.calls.at(-1), "kare");
});
