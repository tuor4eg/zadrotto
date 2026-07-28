import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const query = readFileSync("src/db/queries/authors.ts", "utf8");
const page = readFileSync("src/app/admin/(protected)/authors/[id]/page.tsx", "utf8");

describe("admin author profile", () => {
  it("loads and displays the nullable author login", () => {
    assert.match(query, /login: authorAccounts\.login/);
    assert.match(
      query,
      /\.leftJoin\(authorAccounts, eq\(authorAccounts\.authorId, authors\.id\)\)/,
    );
    assert.match(page, /Логин[\s\S]*author\.login \?\? "—"/);
  });
});
