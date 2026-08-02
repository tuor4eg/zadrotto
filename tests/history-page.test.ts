import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync("src/app/history/page.tsx", "utf8");
const viewedAt = readFileSync("src/app/history/viewed-at.tsx", "utf8");
const mainPage = readFileSync("src/app/main/page.tsx", "utf8");

describe("viewing history page", () => {
  it("requires an author and orchestrates full validation before pagination", () => {
    assert.match(page, /requireAuthor\(\)/);
    assert.match(page, /getArchiveSettings\(\)/);
    assert.match(page, /getRecentlyViewedEntries\([\s\S]*recentlyViewedHistoryLimit/);
    assert.match(page, /getRecentlyViewedMediaItems\([\s\S]*accessibleMediaTypeCodes/);
    assert.match(page, /after\(\(\) => removeRecentlyViewedIds/);
    assert.match(page, /visibleItems\.slice\(getOffset\(page, pageSize\)/);
    assert.match(page, /PAGE_SIZE_OPTIONS = \[24, 48, 96\]/);
    assert.match(page, /DEFAULT_PAGE_SIZE = 48/);
  });

  it("renders outage, empty and all-disabled states separately", () => {
    assert.match(page, /!result\.ok[\s\S]*временно недоступна/);
    assert.match(page, /result\.entries\.length === 0 \|\| storedItems\.length === 0[\s\S]*История пока пуста/);
    assert.match(page, /visibleItems\.length === 0[\s\S]*Все просмотренные типы сейчас скрыты/);
    assert.match(page, /href="\/"[\s\S]*Перейти в каталог/);
  });

  it("reuses archive cards and formats the stored instant in the browser", () => {
    assert.match(page, /<MediaItemTile[\s\S]*currentAuthorScore=\{item\.currentAuthorScore\}/);
    assert.match(page, /<ViewedAt value=\{viewedAt\.toISOString\(\)\}/);
    assert.match(page, /grid-cols-\[repeat\(auto-fill,72px\)\][\s\S]*justify-start[\s\S]*gap-3/);
    assert.match(viewedAt, /useEffect/);
    assert.match(viewedAt, /Intl\.DateTimeFormat\("ru-RU"/);
    assert.match(viewedAt, /<time ref=\{timeRef\} dateTime=\{value\}>/);
  });

  it("links back to main and exposes full history from the main section", () => {
    assert.doesNotMatch(page, /ArchiveBackLink/);
    assert.match(page, /aria-label="Хлебные крошки"[\s\S]*href="\/"[\s\S]*Главная[\s\S]*История просмотров/);
    assert.match(page, /История просмотров/);
    assert.match(mainPage, /<Section href="\/history"[\s\S]*title="Недавно просмотренное"/);
  });
});
