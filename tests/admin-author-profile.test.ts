import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const query = readFileSync("src/db/queries/authors.ts", "utf8");
const page = readFileSync("src/app/admin/(protected)/authors/[id]/page.tsx", "utf8");
const listPage = readFileSync("src/app/admin/(protected)/authors/page.tsx", "utf8");

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

  it("names the admin card author statistics and links the list to the public profile", () => {
    assert.match(page, /Статистика автора: \$\{author\.code\}/);
    assert.match(
      listPage,
      /href=\{`\/users\/\$\{author\.id\}`\}[\s\S]*aria-label=\{`Смотреть автора \$\{author\.name\}`\}/,
    );
    assert.match(
      listPage,
      /href=\{`\/admin\/authors\/\$\{author\.id\}`\}[\s\S]*aria-label=\{`Статистика автора \$\{author\.name\}`\}/,
    );
    assert.match(listPage, /!author\.isSystem && !author\.blockedAt/);
  });

  it("links rating and review totals to the corresponding author lists", () => {
    assert.match(query, /ratingsCount: sql<number>[\s\S]*ratings\.authorId[\s\S]*authors\.id/);
    assert.match(query, /reviewsCount: sql<number>[\s\S]*contributions\.authorId[\s\S]*contributions\.type[\s\S]*'review'/);
    assert.match(page, /href=\{`\/archive\?ratedBy=\$\{author\.id\}&sort=my_rating_date`\}[\s\S]*label="Оценок"[\s\S]*author\.ratingsCount/);
    assert.match(page, /href=\{`\/admin\/materials\/reviews\?author=\$\{author\.id\}`\}[\s\S]*label="Рецензий"[\s\S]*author\.reviewsCount/);
  });

  it("uses one last-activity definition for the profile and author list", () => {
    assert.match(query, /function authorLastActivityAtSql/);
    assert.match(query, /max\(\$\{mediaItems\.updatedAt\}\)/);
    assert.match(query, /max\(\$\{ratings\.updatedAt\}\)/);
    assert.match(query, /max\(\$\{contributions\.updatedAt\}\)[\s\S]*contributions\.type[\s\S]*'review'/);
    assert.match(query, /max\(\$\{authorSessions\.lastSeenAt\}\)/);
    assert.match(query, /\)::timestamptz`\.mapWith\(createdAt\)/);
    assert.equal(
      (query.match(/authorLastActivityAtSql\(authors\.id, authors\.createdAt\)/g) ?? []).length,
      2,
    );
    assert.match(listPage, /Последняя активность[\s\S]*author\.lastActivityAt/);
  });
});
