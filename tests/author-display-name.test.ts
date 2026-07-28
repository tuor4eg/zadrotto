import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AUTHOR_DISPLAY_NAME_MAX_LENGTH,
  normalizeAuthorDisplayName,
} from "../src/lib/authors/display-name";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function exportedFunction(source: string, name: string, nextName?: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  return source.slice(start, end === -1 ? source.length : end);
}

const authorQueries = read("src/db/queries/authors.ts");
const profileActions = read("src/app/author/(protected)/profile/actions.ts");
const profilePage = read("src/app/author/(protected)/profile/page.tsx");

describe("author display name", () => {
  it("trims non-empty names up to 80 characters", () => {
    assert.equal(AUTHOR_DISPLAY_NAME_MAX_LENGTH, 80);
    assert.equal(normalizeAuthorDisplayName("  Иван Иванов  "), "Иван Иванов");
    assert.equal(normalizeAuthorDisplayName("a".repeat(80)), "a".repeat(80));
    assert.equal(normalizeAuthorDisplayName(""), null);
    assert.equal(normalizeAuthorDisplayName("   "), null);
    assert.equal(normalizeAuthorDisplayName("a".repeat(81)), null);
  });

  it("updates only the authenticated author's display name", () => {
    const action = exportedFunction(
      profileActions,
      "updateAuthorDisplayNameAction",
      "changeAuthorPasswordAction",
    );

    assert.match(action, /const current = await getCurrentAuthorSession\(\)/);
    assert.match(action, /formData\.get\("displayName"\)/);
    assert.match(action, /normalizeAuthorDisplayName/);
    assert.match(action, /updateAuthorDisplayName\(current\.author\.id, name\)/);
    assert.doesNotMatch(action, /formData\.get\("authorId"\)/);
    assert.doesNotMatch(action, /formData\.get\("login"\)|changeAuthorLogin|updateAuthorAccountCredentials/);
  });

  it("persists the name and modification timestamp for the selected author", () => {
    const query = exportedFunction(authorQueries, "updateAuthorDisplayName", "createAuthor");

    assert.match(query, /\.set\(\{ name, updatedAt: new Date\(\) \}\)/);
    assert.match(query, /\.where\(eq\(authors\.id, authorId\)\)/);
    assert.match(query, /\.returning\(\{ id: authors\.id, name: authors\.name \}\)/);
  });

  it("renders the current value, length limit and transient feedback in profile", () => {
    assert.match(profilePage, /<Label htmlFor="displayName">Имя<\/Label>/);
    assert.match(profilePage, /name="displayName"/);
    assert.match(profilePage, /defaultValue=\{current\.author\.name\}/);
    assert.match(profilePage, /maxLength=\{AUTHOR_DISPLAY_NAME_MAX_LENGTH\}/);
    assert.match(profilePage, /required/);
    assert.match(profilePage, /query\.displayNameUpdated[\s\S]*Отображаемое имя изменено/);
    assert.match(profilePage, /query\.displayNameError[\s\S]*от 1 до 80 символов/);
    assert.match(
      profilePage,
      /clearParams=\{\["displayNameError", "displayNameUpdated"\]\}/,
    );
  });

  it("logs the change and revalidates public, cabinet and admin surfaces", () => {
    const action = exportedFunction(
      profileActions,
      "updateAuthorDisplayNameAction",
      "changeAuthorPasswordAction",
    );

    assert.match(action, /revalidatePath\("\/", "layout"\)/);
    assert.match(action, /revalidatePath\("\/admin\/authors"\)/);
    assert.match(action, /revalidatePath\(`\/admin\/authors\/\$\{current\.author\.id\}`\)/);
    assert.match(action, /action: "author\.display-name\.updated"/);
    assert.match(action, /actorType: "author"/);
    assert.match(action, /authorId: current\.author\.id/);
    assert.match(action, /entityLabel: name/);
    assert.match(action, /redirect\(`\$\{PROFILE_PATH\}\?displayNameUpdated=1`\)/);
  });
});
