import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const querySource = readFileSync("src/db/queries/authors.ts", "utf8");
const authorsPageSource = readFileSync(
  "src/app/admin/(protected)/authors/page.tsx",
  "utf8",
);
const tokensPageSource = readFileSync(
  "src/app/admin/(protected)/author-tokens/page.tsx",
  "utf8",
);
const tokenFormSource = readFileSync(
  "src/app/admin/(protected)/author-tokens/create-author-token-form.tsx",
  "utf8",
);

function getFunctionSource(name: string, nextName: string) {
  const start = querySource.indexOf(`export async function ${name}`);
  const end = querySource.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return querySource.slice(start, end);
}

describe("admin authors usage query", () => {
  it("uses indexed existence checks without rating or media joins and aggregation", () => {
    const getAuthorsSource = getFunctionSource("getAuthors", "getAuthorOptions");

    assert.match(getAuthorsSource, /hasUsage: authorHasUsageSql/);
    assert.match(
      querySource,
      /exists\(select 1 from \$\{ratings\} where \$\{ratings\.authorId\} = \$\{authors\.id\}\)/,
    );
    assert.match(
      querySource,
      /exists\(select 1 from \$\{mediaItems\} where \$\{mediaItems\.createdByAuthorId\} = \$\{authors\.id\}\)/,
    );
    assert.doesNotMatch(getAuthorsSource, /(?:left|inner)Join\((?:ratings|mediaItems)/);
    assert.doesNotMatch(getAuthorsSource, /count\(distinct|\.groupBy\(/);
  });

  it("uses the boolean for deletion UI without exposing a mobile usage count", () => {
    assert.equal(
      (authorsPageSource.match(
        /const canDeleteAuthor = !author\.hasUsage && !isLastSystemAuthor/g,
      ) ?? []).length,
      2,
    );
    assert.match(authorsPageSource, /author\.hasUsage[\s\S]*Нельзя удалить: есть данные/);
    assert.match(
      authorsPageSource,
      /<ConfirmAction[\s\S]*disabled=\{!canDeleteAuthor\}/,
    );
    assert.doesNotMatch(authorsPageSource, /usageCount|>Данные</);
  });

  it("keeps server-side usage and last-system-author deletion guards", () => {
    const deleteSource = querySource.slice(
      querySource.indexOf("export async function deleteAuthorIfUnused"),
    );

    assert.match(deleteSource, /count: authorUsageCountByIdSql\(id\)/);
    assert.match(deleteSource, /if \(usage\.count > 0\)[\s\S]*status: "has-data"/);
    assert.match(
      deleteSource,
      /if \(usage\.isSystem\)[\s\S]*systemAuthors\.count <= 1[\s\S]*status: "last-system-author"/,
    );
    assert.match(
      deleteSource,
      /db\.transaction[\s\S]*tx\.delete\(authorAccessTokens\)[\s\S]*tx[\s\S]*\.delete\(authors\)/,
    );
  });

  it("loads lightweight author options for token creation", () => {
    const optionsSource = getFunctionSource("getAuthorOptions", "getAuthorById");

    assert.match(tokensPageSource, /import \{ getAuthorOptions \}/);
    assert.match(tokensPageSource, /getAuthorOptions\(\)/);
    assert.doesNotMatch(tokensPageSource, /getAuthors/);
    assert.match(tokenFormSource, /ReturnType<typeof getAuthorOptions>/);
    assert.match(tokensPageSource, /authors\.filter\(\(author\) => !author\.isSystem\)/);
    assert.match(optionsSource, /id: authors\.id,[\s\S]*name: authors\.name,[\s\S]*isSystem: authors\.isSystem/);
    assert.match(tokenFormSource, /name="authorId"[\s\S]*authors\.map\(\(author\)/);
  });
});
