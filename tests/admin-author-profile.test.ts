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
  it("loads and displays the nullable primary email", () => {
    assert.match(query, /email: authorEmails\.email/);
    assert.match(
      query,
      /\.leftJoin\([\s\S]*authorEmails[\s\S]*eq\(authorEmails\.authorId, authors\.id\)[\s\S]*eq\(authorEmails\.isPrimary, true\)/,
    );
    assert.match(page, /Email[\s\S]*mailto:\$\{author\.email\}[\s\S]*author\.email[\s\S]*: "—"/);
  });
});
