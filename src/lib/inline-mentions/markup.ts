export type InlineTextNode = {
  type: "text";
  value: string;
};

export type InlineEntityNode = {
  type: "entity";
  entityType: string;
  id: string;
  label: string;
};

export type InlineNode = InlineTextNode | InlineEntityNode;

export type InlineEntity =
  | { entityType: string; id: string; label: string; type?: never }
  | { type: string; id: string; label: string; entityType?: never };

export type MentionSuggestion = {
  type: string;
  id: string;
  label: string;
  subtitle?: string;
  image?: string;
};

export type ResolvedInlineEntity = {
  type: string;
  id: string;
  href: string;
};

const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;
const ENTITY_ID_PATTERN = /^[^\s|\[\]\u0000-\u001f\u007f]+$/u;

type MarkerParseResult =
  | { kind: "valid"; end: number; node: InlineEntityNode }
  | { kind: "invalid"; end: number }
  | { kind: "unclosed" };

function appendText(nodes: InlineNode[], value: string) {
  if (!value) return;

  const previousNode = nodes.at(-1);
  if (previousNode?.type === "text") {
    previousNode.value += value;
    return;
  }

  nodes.push({ type: "text", value });
}

function parseMarkerAt(value: string, start: number): MarkerParseResult {
  let cursor = start + 2;
  let separator = -1;
  let hasNestedMarker = false;

  while (cursor < value.length) {
    if (value.startsWith("[[", cursor)) {
      hasNestedMarker = true;
      cursor += 2;
      continue;
    }

    if (value.startsWith("]]", cursor)) {
      const end = cursor + 2;
      if (separator < 0 || hasNestedMarker) return { kind: "invalid", end };

      const identity = value.slice(start + 2, separator);
      const colon = identity.indexOf(":");
      const entityType = colon < 0 ? "" : identity.slice(0, colon);
      const id = colon < 0 ? "" : identity.slice(colon + 1);
      const rawLabel = value.slice(separator + 1, cursor);

      if (
        !ENTITY_TYPE_PATTERN.test(entityType)
        || !ENTITY_ID_PATTERN.test(id)
        || rawLabel.length === 0
      ) {
        return { kind: "invalid", end };
      }

      let label = "";
      for (let labelCursor = 0; labelCursor < rawLabel.length; labelCursor += 1) {
        const character = rawLabel[labelCursor];
        const escapedCharacter = rawLabel[labelCursor + 1];
        if (character === "\\" && (escapedCharacter === "\\" || escapedCharacter === "]")) {
          label += escapedCharacter;
          labelCursor += 1;
        } else {
          label += character;
        }
      }

      return {
        kind: "valid",
        end,
        node: { type: "entity", entityType, id, label },
      };
    }

    if (value[cursor] === "\\" && (value[cursor + 1] === "\\" || value[cursor + 1] === "]")) {
      cursor += 2;
      continue;
    }

    if (separator < 0 && value[cursor] === "|") separator = cursor;
    cursor += 1;
  }

  return { kind: "unclosed" };
}

export function parseInlineMarkup(value: string): InlineNode[] {
  if (!value.includes("[[")) return value ? [{ type: "text", value }] : [];

  const nodes: InlineNode[] = [];
  let textStart = 0;
  let cursor = 0;

  while (cursor < value.length) {
    if (!value.startsWith("[[", cursor)) {
      cursor += 1;
      continue;
    }

    appendText(nodes, value.slice(textStart, cursor));
    const marker = parseMarkerAt(value, cursor);

    if (marker.kind === "valid") {
      nodes.push(marker.node);
      cursor = marker.end;
      textStart = cursor;
      continue;
    }

    if (marker.kind === "invalid") {
      appendText(nodes, value.slice(cursor, marker.end));
      cursor = marker.end;
      textStart = cursor;
      continue;
    }

    appendText(nodes, "[[");
    cursor += 2;
    textStart = cursor;
  }

  appendText(nodes, value.slice(textStart));
  return nodes;
}

export function serializeInlineEntity(entity: InlineEntity) {
  const entityType = entity.entityType ?? entity.type;
  if (!ENTITY_TYPE_PATTERN.test(entityType)) {
    throw new Error("Invalid inline entity type.");
  }
  if (!ENTITY_ID_PATTERN.test(entity.id)) {
    throw new Error("Invalid inline entity id.");
  }
  if (!entity.label) {
    throw new Error("Inline entity label must not be empty.");
  }

  const escapedLabel = entity.label.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  return `[[${entityType}:${entity.id}|${escapedLabel}]]`;
}

export function inlineMarkupToPlainText(value: string) {
  return parseInlineMarkup(value)
    .map((node) => node.type === "text" ? node.value : node.label)
    .join("");
}
