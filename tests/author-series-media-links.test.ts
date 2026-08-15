import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync("src/app/series/[code]/actions.ts", "utf8");
const clientSource = readFileSync(
  "src/app/series/[code]/series-media-link-search.tsx",
  "utf8",
);
const globalStylesSource = readFileSync("src/app/globals.css", "utf8");
const pageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");
const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const routeSource = readFileSync(
  "src/app/api/series/[code]/media-search/route.ts",
  "utf8",
);

function getFunctionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return source.slice(start, end);
}

describe("author series media search access", () => {
  it("hides the author-only UI from guests and rejects unauthenticated search", () => {
    assert.match(
      pageSource,
      /currentAuthor \? \([\s\S]*<SeriesMediaLinkSearch[\s\S]*\) : null/,
    );
    assert.match(routeSource, /const \[author,[\s\S]*getCurrentAuthor\(\)/);
    assert.match(
      routeSource,
      /if \(!author\) \{[\s\S]*NextResponse\.json\(\{ items: \[\] \}, \{ status: 401 \}\)/,
    );
    assert.match(actionsSource, /const author = await requireAuthor\(\)/);
  });

  it("requires a meaningful query and a published series", () => {
    assert.match(routeSource, /searchQuery\.length < 2/);
    assert.match(routeSource, /getFranchiseByCode\(code\)/);
    assert.match(routeSource, /if \(!franchise\)[\s\S]*status: 404/);
  });

  it("searches published media and returns safe link capabilities", () => {
    const searchQuery = getFunctionSource(
      querySource,
      "searchPublishedMediaItemsForFranchise",
      "getPublishedFranchisesPage",
    );

    assert.match(searchQuery, /publishedMediaItemCondition/);
    assert.match(searchQuery, /title: mediaItems\.title/);
    assert.match(searchQuery, /originalTitle: mediaItems\.originalTitle/);
    assert.match(searchQuery, /mediaType: mediaItems\.mediaType/);
    assert.match(searchQuery, /releaseYear: mediaItems\.releaseYear/);
    assert.match(searchQuery, /linkStatus: mediaItemFranchises\.publicationStatus/);
    assert.match(searchQuery, /\.limit\(10\)/);
    assert.match(
      searchQuery,
      /const isOwnLink = linkAuthorId === input\.authorId[\s\S]*const canRemove =[\s\S]*isOwnLink[\s\S]*item\.linkStatus !== null[\s\S]*item\.linkStatus !== PUBLISHED_PUBLICATION_STATUS/,
    );
    assert.match(
      searchQuery,
      /linkStatus:[\s\S]*!isOwnLink[\s\S]*item\.linkStatus !== PUBLISHED_PUBLICATION_STATUS[\s\S]*\? "submitted" as const/,
    );
    assert.match(searchQuery, /return rows\.map\(\(\{ linkAuthorId, \.\.\.item \}\) => \{/);
    assert.doesNotMatch(searchQuery, /return rows;/);
  });

  it("excludes current published links before ordering and limiting search results", () => {
    const searchQuery = getFunctionSource(
      querySource,
      "searchPublishedMediaItemsForFranchise",
      "getPublishedFranchisesPage",
    );
    const visibilityCondition = searchQuery.indexOf(
      "isNull(mediaItemFranchises.publicationStatus)",
    );
    const orderBy = searchQuery.indexOf(".orderBy(");
    const limit = searchQuery.indexOf(".limit(10)");

    assert.notEqual(visibilityCondition, -1);
    assert.ok(visibilityCondition < orderBy);
    assert.ok(orderBy < limit);
    assert.match(
      searchQuery,
      /or\([\s\S]*isNull\(mediaItemFranchises\.publicationStatus\),[\s\S]*ne\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\),[\s\S]*\)/,
    );
    assert.doesNotMatch(
      searchQuery.slice(searchQuery.indexOf("return rows.map")),
      /\.filter\(/,
    );
  });
});

describe("author series media mutations", () => {
  it("reuses the shared insert and derives submitted or published from permission", () => {
    assert.match(
      actionsSource,
      /getFranchisePublicationStatusAfterAuthorSubmit\(\{[\s\S]*canPublishFranchisesWithoutReview: author\.canPublishFranchisesWithoutReview/,
    );
    assert.match(
      actionsSource,
      /createAuthorMediaItemFranchiseLinks\(\{[\s\S]*authorId: author\.id,[\s\S]*franchiseIds: \[franchise\.id\],[\s\S]*mediaItemId: mediaItem\.id,[\s\S]*publicationStatus/,
    );
    assert.match(
      actionsSource,
      /publicationStatus === "published"[\s\S]*"franchise\.media\.attached"[\s\S]*"franchise\.media\.suggested"/,
    );
  });

  it("deletes atomically only an author's nonpublished link", () => {
    const removeQuery = getFunctionSource(
      querySource,
      "removeAuthorMediaItemFranchiseLink",
      "requestAuthorMediaItemFranchiseRemoval",
    );

    assert.match(removeQuery, /\.delete\(mediaItemFranchises\)/);
    assert.match(removeQuery, /eq\(mediaItemFranchises\.mediaItemId, input\.mediaItemId\)/);
    assert.match(removeQuery, /eq\(mediaItemFranchises\.franchiseId, input\.franchiseId\)/);
    assert.match(removeQuery, /eq\(mediaItemFranchises\.createdByAuthorId, input\.authorId\)/);
    assert.match(
      removeQuery,
      /inArray\(mediaItemFranchises\.publicationStatus, \["private", "submitted", "rejected"\]\)/,
    );
    assert.doesNotMatch(removeQuery, /"published"/);
  });

  it("requests published-link removal and returns its explicit status to the series client", () => {
    assert.match(actionsSource, /requestAuthorMediaItemFranchiseRemoval\(\{[\s\S]*authorId: author\.id,[\s\S]*canPublishFranchisesWithoutReview: author\.canPublishFranchisesWithoutReview/);
    assert.match(actionsSource, /let removalStatus: "removed" \| "requested"/);
    assert.match(actionsSource, /removalStatus = removedLink\.status/);
    assert.match(actionsSource, /return \{ error: null, linkStatus: null, removalStatus, success: true \}/);
  });

  it("revalidates every affected surface and records add/remove identities", () => {
    for (const pathPattern of [
      /revalidatePath\("\/"\)/,
      /revalidatePath\("\/series"\)/,
      /revalidatePath\(`\/series\/\$\{franchiseCode\}`\)/,
      /revalidatePath\(`\/media\/\$\{mediaItemCode\}`\)/,
      /revalidatePath\("\/author\/series"\)/,
      /revalidatePath\("\/admin\/franchise-review"\)/,
      /revalidatePath\("\/admin", "layout"\)/,
    ]) {
      assert.match(actionsSource, pathPattern);
    }

    assert.match(actionsSource, /"franchise\.media\.detached"/);
    assert.match(actionsSource, /removalStatus === "requested"[\s\S]*"franchise\.media\.removal-requested"/);
    assert.match(actionsSource, /mediaItem: \{ id: mediaItem\.id, title: mediaItem\.title \}/);
    assert.match(
      actionsSource,
      /franchises: \[\{ id: franchise\.id, title: franchise\.title \}\]/,
    );
  });
});

describe("author series media link client", () => {
  it("reserves space for the translated series sticker", () => {
    assert.match(
      globalStylesSource,
      /@media \(min-width: 640px\) \{[\s\S]*?\.archive-franchise-sticker \{[\s\S]*?margin-bottom: 2rem;[\s\S]*?transform: translateY\(32px\) rotate\(-0\.2deg\);[\s\S]*?\}/,
    );
  });

  it("stays inside the series sticker without changing its intrinsic width", () => {
    const stickerStart = pageSource.indexOf('<div className="archive-franchise-sticker">');
    const stickerEnd = pageSource.indexOf(
      "{franchise.description?.trim() ? (",
      stickerStart,
    );
    const stickerSource = pageSource.slice(stickerStart, stickerEnd);

    assert.notEqual(stickerStart, -1);
    assert.notEqual(stickerEnd, -1);
    assert.equal(pageSource.match(/<SeriesMediaLinkSearch/g)?.length, 1);
    assert.match(
      stickerSource,
      /\{franchise\.title\}[\s\S]*formatMediaItemsCount\(items\.length\)[\s\S]*currentAuthor \? \([\s\S]*<SeriesMediaLinkSearch/,
    );
    assert.match(
      clientSource,
      /return \([\s\S]*<div ref=\{rootRef\} className="relative mt-4 w-0 min-w-full border-t border-dashed border-stone-300 pt-4">/,
    );
    assert.doesNotMatch(clientSource, /border-y border-dashed border-stone-300 px-6 py-5 sm:px-8/);
  });

  it("keeps dynamic search content in an accessible absolute dropdown", () => {
    const dropdownStart = clientSource.indexOf("{dropdownOpen ? (");

    assert.notEqual(dropdownStart, -1);
    assert.match(
      clientSource.slice(dropdownStart),
      /absolute left-0 right-0 top-full z-\[80\][\s\S]*max-h-\[[^\]]+\][\s\S]*overflow-y-auto/,
    );
    assert.match(
      clientSource.slice(dropdownStart),
      /Ищем записи…[\s\S]*searchError[\s\S]*Ничего не найдено\.[\s\S]*visibleItems\.map[\s\S]*<button/,
    );
    assert.doesNotMatch(
      clientSource.slice(clientSource.indexOf("return ("), dropdownStart),
      /Ищем записи|Ничего не найдено|visibleItems\.map|role="status"|role="alert"/,
    );
    assert.match(clientSource, /aria-controls="series-media-search-results"/);
    assert.match(clientSource, /id="series-media-search-results"[\s\S]*role="region"/);
    assert.doesNotMatch(clientSource, /role="combobox"|role="listbox"|role="option"/);
  });

  it("uses a solid dropdown with a visually hidden scrollbar and compact action", () => {
    assert.doesNotMatch(clientSource, /archive-paper-surface|archive-scrollbar/);
    assert.match(
      clientSource,
      /className="absolute left-0 right-0 top-full[\s\S]*bg-white shadow-lg"/,
    );
    assert.match(
      clientSource,
      /overflow-y-auto \[-ms-overflow-style:none\] \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/,
    );
    assert.match(
      clientSource,
      /<li key=\{item\.id\} className="flex min-w-0 items-center gap-3 px-3 py-3">[\s\S]*<div className="min-w-0 flex-1">[\s\S]*<button[\s\S]*className="inline-flex size-9 shrink-0 /,
    );
    assert.doesNotMatch(clientSource, /<button[\s\S]*order-first/);
  });

  it("keeps the compact scrollbar feature-local without broad archive changes", () => {
    assert.match(
      globalStylesSource,
      /\.series-media-search-scrollbar \{[\s\S]*scrollbar-width: thin;[\s\S]*\}/,
    );
    assert.match(
      globalStylesSource,
      /\.series-media-search-scrollbar::-webkit-scrollbar-track \{[\s\S]*border-radius: 999px;[\s\S]*\}/,
    );
    assert.match(
      globalStylesSource,
      /\.series-media-search-scrollbar::-webkit-scrollbar-thumb \{[\s\S]*border-radius: 999px;[\s\S]*\}/,
    );
    assert.match(
      globalStylesSource,
      /\.series-media-search-scrollbar::-webkit-scrollbar-button \{[\s\S]*display: none;[\s\S]*width: 0;[\s\S]*height: 0;[\s\S]*\}/,
    );
    assert.match(globalStylesSource, /\.archive-scrollbar \{[\s\S]*scrollbar-gutter: stable/);
    assert.doesNotMatch(
      globalStylesSource,
      /\.archive-scrollbar\s*,\s*\.series-media-search-scrollbar/,
    );
  });

  it("dismisses the dropdown on Escape or an outside pointer without disabling actions", () => {
    assert.match(
      clientSource,
      /if \(!rootRef\.current\?\.contains\(event\.target as Node\)\) \{[\s\S]*setOpen\(false\)/,
    );
    assert.match(
      clientSource,
      /if \(event\.key === "Escape"\) \{[\s\S]*setOpen\(false\)/,
    );
    assert.match(clientSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(clientSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
    assert.match(
      clientSource,
      /onClick=\{\(\) => mutateLink\(item\)\}[\s\S]*type="button"/,
    );
  });

  it("debounces cancellable searches and ignores aborted requests", () => {
    assert.match(clientSource, /new AbortController\(\)/);
    assert.match(clientSource, /window\.setTimeout\(async \(\) => \{/);
    assert.match(clientSource, /\}, 250\)/);
    assert.match(clientSource, /\{ signal: controller\.signal \}/);
    assert.match(clientSource, /window\.clearTimeout\(timeoutId\)/);
    assert.match(clientSource, /controller\.abort\(\)/);
    assert.match(clientSource, /error\.name === "AbortError"/);
  });

  it("shows metadata and only enables valid plus or minus actions", () => {
    assert.match(clientSource, /const canAdd = item\.linkStatus === null/);
    assert.match(
      clientSource,
      /const disabled = pendingId !== null \|\| \(!canAdd && !item\.canRemove\)/,
    );
    assert.match(clientSource, /item\.canRemove \? \([\s\S]*<Minus/);
    assert.match(clientSource, /canAdd \? \([\s\S]*<Plus/);
    assert.match(clientSource, /\{item\.title\}/);
    assert.match(
      clientSource,
      /item\.originalTitle && item\.originalTitle !== item\.title[\s\S]*\{item\.originalTitle\}/,
    );
    assert.match(clientSource, /getMediaTypeLabel\(item\.mediaType, mediaTypes\)/);
    assert.match(clientSource, /item\.releaseYear \? ` · \$\{item\.releaseYear\}`/);
  });

  it("removes a newly published row while preserving submitted and removed mappings", () => {
    assert.match(
      clientSource,
      /result\.linkStatus === "published"[\s\S]*currentItems\.filter\(\(currentItem\) => currentItem\.id !== item\.id\)[\s\S]*currentItems\.map/,
    );
    assert.match(
      clientSource,
      /currentItem\.id === item\.id[\s\S]*canRemove: result\.linkStatus !== null,[\s\S]*linkStatus: result\.linkStatus/,
    );
    assert.doesNotMatch(
      clientSource,
      /currentItem\.id === item\.id[\s\S]{0,180}linkStatus: "published"/,
    );
  });

  it("closes and resets search when the last visible result is published", () => {
    assert.match(
      clientSource,
      /result\.linkStatus === "published" &&[\s\S]*visibleItems\.length === 1 &&[\s\S]*queryRef\.current\.trim\(\) === mutationQuery[\s\S]*setOpen\(false\);[\s\S]*setQuery\(""\);[\s\S]*setItems\(\[\]\);[\s\S]*setResolvedQuery\(""\);[\s\S]*setSearchError\(null\);[\s\S]*setMessage\(null\);[\s\S]*return;/,
    );
    assert.match(clientSource, /const nextQuery = event\.target\.value;[\s\S]*queryRef\.current = nextQuery/);
  });

  it("keeps a multi-result search open after filtering a published item", () => {
    const lastResultBranch = clientSource.indexOf(
      'result.linkStatus === "published" &&',
    );
    const filterBranch = clientSource.indexOf(
      "setItems((currentItems) =>",
      lastResultBranch,
    );
    const successMessage = clientSource.indexOf(
      '"Запись добавлена в серию."',
      filterBranch,
    );

    assert.notEqual(lastResultBranch, -1);
    assert.notEqual(filterBranch, -1);
    assert.notEqual(successMessage, -1);
    assert.match(
      clientSource.slice(filterBranch, successMessage),
      /currentItems\.filter\(\(currentItem\) => currentItem\.id !== item\.id\)/,
    );
    assert.doesNotMatch(
      clientSource.slice(filterBranch, successMessage),
      /setOpen\(false\)|setQuery\(""\)/,
    );
  });

  it("keeps pending state local and reports mutation results accessibly", () => {
    assert.match(clientSource, /const \[pendingId, setPendingId\]/);
    assert.match(clientSource, /const pending = pendingId === item\.id/);
    assert.match(clientSource, /setPendingId\(item\.id\)/);
    assert.match(clientSource, /setPendingId\(null\)/);
    assert.match(clientSource, /try \{[\s\S]*await (?:remove|add)AuthorSeriesMediaLinkAction/);
    assert.match(clientSource, /catch \{[\s\S]*Возможно, сессия истекла/);
    assert.match(clientSource, /finally \{[\s\S]*setPendingId\(null\)/);
    assert.match(clientSource, /setItems\(\(currentItems\) =>/);
    assert.match(clientSource, /role="status"/);
    assert.match(clientSource, /Связь уже существует\./);
    assert.match(clientSource, /Связь отправлена на проверку\./);
    assert.match(clientSource, /result\.removalStatus === "requested"[\s\S]*Запрос на удаление отправлен на проверку\./);
    assert.match(clientSource, /Связь удалена\./);
  });

  it("does not flash an empty result and distinguishes search failures", () => {
    assert.match(clientSource, /const \[resolvedQuery, setResolvedQuery\]/);
    assert.match(
      clientSource,
      /const hasResolvedCurrentQuery =[\s\S]*resolvedQuery === normalizedQuery/,
    );
    assert.match(
      clientSource,
      /hasResolvedCurrentQuery && !searchError && !message && visibleItems\.length === 0/,
    );
    assert.match(
      clientSource,
      /onChange=\{\(event\) => \{[\s\S]*const nextQuery = event\.target\.value;[\s\S]*setQuery\(nextQuery\);[\s\S]*setMessage\(null\)/,
    );
    assert.match(clientSource, /response\.status === 401[\s\S]*Сессия истекла/);
    assert.match(clientSource, /role="alert"/);
  });
});
