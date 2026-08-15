import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const query = readFileSync("src/db/queries/main-page.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");

describe("main page streaming", () => {
  it("starts independent data promises without a mega await", () => {
    assert.match(query, /export function createMainPageDataPromises/);
    for (const key of ["top", "newItems", "reviews", "latestRatings", "wanted", "about"]) {
      assert.match(query, new RegExp(`${key}:`));
    }
    assert.doesNotMatch(query, /export async function getMainPageData/);
    assert.doesNotMatch(query, /await Promise\.all\(\[\s*topRowsPromise/);
    assert.match(query, /published[\s\S]*enabledMediaTypeCodes|PUBLISHED_PUBLICATION_STATUS[\s\S]*enabledMediaTypeCodes/);
    assert.match(query, /getRotatedMediaTypeCodes[\s\S]*roundRobinMediaTypeItems/);
  });

  it("renders section shells with independent suspense boundaries", () => {
    assert.match(page, /import \{ Suspense \} from "react"/);
    assert.match(page, /Loader2[\s\S]*animate-spin/);
    assert.match(page, /role="status" aria-label="Загрузка"/);
    for (const key of ["top", "newItems", "reviews", "latestRatings", "wanted"]) {
      assert.match(page, new RegExp(`Suspense[\\s\\S]*SectionItems[^>]*promise=\\{data\\.${key}\\}`));
    }
    assert.match(page, /DossierContent[\s\S]*promise=\{dossierPromise\}/);
    assert.match(page, /AboutArchive promise=\{data\.about\}/);
    assert.match(page, /RandomDossierLink promise=\{dossierPromise\}/);
    assert.doesNotMatch(page, /await\s+createMainPageDataPromises\(/);
  });

  it("keeps the about archive widget bounded and scrolls new media types", () => {
    const aboutArchiveSection = page.match(
      /<section className="([^"]*xl:col-start-2 xl:row-start-2[^"]*)">/,
    )?.[1];

    assert.ok(aboutArchiveSection);
    assert.match(aboutArchiveSection, /overflow-hidden/);
    assert.match(aboutArchiveSection, /contain:size/);
    assert.match(
      page,
      /className="h-full overflow-y-auto \[-ms-overflow-style:none\] \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden"[\s\S]*<AboutArchive promise=\{data\.about\}/,
    );
  });

  it("matches the dossier action height and hover treatment to the header action", () => {
    assert.match(
      page,
      /className="archive-control-surface mt-auto flex h-9 shrink-0[^"]*transition-\[border-color,background-color,width,padding\] hover:border-stone-700 hover:bg-stone-50">Открыть/,
    );
    assert.doesNotMatch(page, /mt-auto flex h-10[^>]*>Открыть/);
  });

  it("opens the latest review from the main-page review section", () => {
    assert.match(
      query,
      /reviewId: sql<number>`\([\s\S]*array_agg\([\s\S]*contributions\.createdAt\} desc[\s\S]*contributions\.id\} desc[\s\S]*\)\[1\]::int`/,
    );
    assert.match(page, /linkToReview && item\.reviewId[\s\S]*\?review=\$\{item\.reviewId\}/);
    assert.match(page, /<SectionItems linkToReview promise=\{data\.reviews\}/);
  });
});
