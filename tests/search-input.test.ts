import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

type Node = {
  type: string;
  props: {
    [key: string]: unknown;
    children: unknown;
    ref: { current: unknown };
    onChange: (event: unknown) => void;
    onClick: () => void;
    className: string;
  };
};
function harness() {
  const state: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let index = 0;
  let refIndex = 0;
  class InputElement {
    text = "";
    focused = false;
    onInput?: () => void;
    get value() { return this.text; }
    set value(value: string) { this.text = value; }
    dispatchEvent(event: Event) {
      assert.equal(event.type, "input");
      assert.equal(event.bubbles, true);
      this.onInput?.();
    }
    focus() { this.focused = true; }
  }
  const jsx = (type: string, props: Node["props"]) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useRef: () => refs[refIndex++] ?? (refs[refIndex - 1] = { current: null }),
      useState: (initial: unknown) => {
        const slot = index++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (next: unknown) => { state[slot] = next; }];
      },
    },
    "lucide-react": { X: "icon" },
    "@/lib/common/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
  };
  const sandboxModule = { exports: {} as { SearchInput: (props: Record<string, unknown>) => Node } };
  const code = ts.transpileModule(readFileSync("src/components/ui/search-input.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, HTMLInputElement: InputElement, Event,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  function render(props: Record<string, unknown> = {}) {
    index = refIndex = 0;
    const tree = sandboxModule.exports.SearchInput(props);
    const [input, button] = tree.props.children as [Node, Node | null];
    const element = new InputElement();
    element.value = String(props.value ?? props.defaultValue ?? "");
    input.props.ref.current = element;
    element.onInput = () => input.props.onChange({ target: element, currentTarget: element });
    return { input, button, element };
  }
  return { render };
}

test("filled search exposes an accessible clear button without focus or hover", () => {
  const { render } = harness();
  assert.equal(render({ value: "" }).button, null);
  const { button } = render({ value: "Матрица" });
  assert.equal(button?.props.type, "button");
  assert.equal(button?.props["aria-label"], "Очистить поиск");
  assert.doesNotMatch(button?.props.className, /hover:opacity|hover:visible|hidden/);
});

test("clear uses the normal change handler, empties the value and focuses the field", () => {
  const changes: string[] = [];
  const { render } = harness();
  const { button, element } = render({ value: "Матрица", onChange: (event: { currentTarget: { value: string } }) => changes.push(event.currentTarget.value) });
  button?.props.onClick();
  assert.equal(element.value, "");
  assert.deepEqual(changes, [""]);
  assert.equal(element.focused, true);
});

test("uncontrolled search and disabled or readonly inputs preserve expected behavior", () => {
  const { render } = harness();
  const initial = render({ defaultValue: "Архив" });
  assert.ok(initial.button);
  initial.button.props.onClick();
  assert.equal(render({ defaultValue: "Архив" }).button, null);
  const locked = render({ value: "Архив", disabled: true });
  locked.button?.props.onClick();
  assert.equal(locked.element.value, "Архив");
  assert.equal(locked.button?.props.disabled, true);
  assert.equal(render({ value: "Архив", readOnly: true }).button, null);
});
