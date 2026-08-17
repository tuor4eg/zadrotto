import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const authorLayoutSource = readFileSync(
  "src/app/author/(protected)/layout.tsx",
  "utf8",
);
const homePageSource = readFileSync("src/app/page.tsx", "utf8");
const proposalsMenuSource = readFileSync(
  "src/app/author/(protected)/author-proposals-menu.tsx",
  "utf8",
);

function countMatches(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function getArchiveShellClassName(source: string) {
  const match = source.match(
    /<div className="([^"]*mx-auto[^"]*max-w-\[1480px\][^"]*)">/,
  );

  assert.ok(match, "archive shell with the site width should be present");
  return match[1];
}

describe("protected author layout", () => {
  it("uses the same outer archive shell and section spacing as the home page", () => {
    assert.match(authorLayoutSource, /<main className="archive-page /);
    assert.equal(
      getArchiveShellClassName(authorLayoutSource),
      getArchiveShellClassName(homePageSource),
    );
    assert.match(
      authorLayoutSource,
      /<section\s+className="archive-paper-surface archive-panel /,
    );
  });

  it("keeps the logo, author identity, and cabinet navigation in the header", () => {
    const header = authorLayoutSource.match(/<header[\s\S]*?<\/header>/)?.[0];

    assert.ok(header, "author header should be present");
    assert.match(header, /archive-main-brand-header archive-paper archive-panel/);
    assert.match(header, /archive-main-brand-header archive-paper archive-panel relative z-20/);
    assert.match(
      header,
      /<Link href="\/"[^>]*aria-label="На главную">\s*<Image[\s\S]*?src="\/site-logo\.png"[\s\S]*?\/>\s*<\/Link>\s*<h1[\s\S]*?Кабинет автора: \{author\.name\}[\s\S]*?<Link\s+href="\/author"\s+aria-label="Главная кабинета автора"[\s\S]*?<Avatar/,
    );
    assert.doesNotMatch(header, /Журнал, которого не было|База хранит факты/);
    assert.match(header, /<nav\s+aria-label="Навигация кабинета автора"/);
    assert.match(header, /style=\{\{ overflow: "visible" \}\}/);
    assert.match(header, /href="\/author"[\s\S]*?>\s*Статистика\s*<\/Link>[\s\S]*?href="\/author\/achievements"[\s\S]*?>\s*Ачивки\s*<\/Link>[\s\S]*?<AuthorProposalsMenu \/>/);
    assert.match(header, /href="\/author\/profile"/);
    assert.match(header, /action=\{logoutAuthor\}/);
  });

  it("uses a proposals disclosure without duplicating its links in the layout", () => {
    assert.equal(countMatches(proposalsMenuSource, />\s*Предложения\s*</g), 1);
    assert.match(proposalsMenuSource, /aria-expanded=\{isOpen\}/);
    assert.match(proposalsMenuSource, /aria-controls=\{menuId\}/);
    assert.match(proposalsMenuSource, /id=\{menuId\}/);
    assert.doesNotMatch(proposalsMenuSource, /aria-haspopup|role="menu(?:item)?"/);
    assert.match(
      proposalsMenuSource,
      /href="\/author\/media"[\s\S]*?onClick=\{\(\) => setIsOpen\(false\)\}[\s\S]*?>\s*Записи\s*<\/Link>/,
    );
    assert.match(
      proposalsMenuSource,
      /href="\/author\/series"[\s\S]*?onClick=\{\(\) => setIsOpen\(false\)\}[\s\S]*?>\s*Серии\s*<\/Link>/,
    );
    assert.match(
      proposalsMenuSource,
      /event\.key === "Escape"[\s\S]*setIsOpen\(false\)[\s\S]*triggerRef\.current\?\.focus\(\)/,
    );
    assert.match(proposalsMenuSource, /document\.addEventListener\("pointerdown"/);
    assert.match(
      proposalsMenuSource,
      /className="relative shrink-0"[\s\S]*onMouseEnter=\{\(\) => setIsOpen\(true\)\}[\s\S]*onMouseLeave=\{\(\) => setIsOpen\(false\)\}/,
    );
    assert.match(proposalsMenuSource, /absolute left-0 top-full z-\[60\]/);
    assert.doesNotMatch(proposalsMenuSource, /top-full[^\"]*mt-2/);
    assert.match(
      proposalsMenuSource,
      /onBlur=\{\(event\) => \{[\s\S]*event\.currentTarget\.contains\(event\.relatedTarget\)[\s\S]*setIsOpen\(false\)/,
    );
    assert.doesNotMatch(authorLayoutSource, /href="\/author\/(?:media|series)"/);
    assert.doesNotMatch(authorLayoutSource, />\s*(?:Главная|Архив)\s*</);
  });
});
