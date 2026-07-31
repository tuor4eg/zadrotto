import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");
const tileSource = readFileSync("src/app/series/[code]/series-media-unlink-tile.tsx", "utf8");
const queriesSource = readFileSync("src/db/queries/franchises.ts", "utf8");

describe("series media unlink tile", () => {
  it("is available only to an author for a link directly attached to this series", () => {
    assert.match(
      pageSource,
      /section\.items\.map\(\(item\) => currentAuthor && item\.hasDirectFranchiseLink \? \([\s\S]*<SeriesMediaUnlinkTile[\s\S]*canPublishFranchisesWithoutReview=\{currentAuthor\.canPublishFranchisesWithoutReview\}/,
    );
    assert.match(
      pageSource,
      /\) : currentAuthor \? \([\s\S]*<MediaItemStatusTile key=\{item\.id\}/,
    );
    assert.match(
      pageSource,
      /currentAuthorStatus=\{item\.currentAuthorStatus\}/,
    );
    assert.match(
      queriesSource,
      /hasDirectFranchiseLink: sql<boolean>`bool_or\(\$\{mediaItemFranchises\.franchiseId\} = \$\{franchiseId\}\)`/,
    );
    assert.match(
      queriesSource,
      /currentAuthorStatus: currentAuthorStatusSql\(currentAuthorId\)/,
    );
  });

  it("places the unlink affordance at the tile's top-left corner", () => {
    assert.match(tileSource, /className="group relative min-w-0 touch-pan-y"/);
    assert.match(tileSource, /absolute left-2 top-2 z-30 flex items-start gap-1/);
    assert.match(tileSource, /<ArchiveTooltip label="Удалить из серии" side="right"/);
    assert.match(tileSource, /aria-label=\{`Удалить запись \$\{item\.title\} из серии`\}/);
    assert.match(tileSource, /<Unlink className="size-3\.5" \/>/);
    assert.match(
      tileSource,
      /<Unlink[\s\S]*<AuthorMediaStatusControls[\s\S]*variant="tile"/,
    );
  });

  it("opens confirmation before invoking the existing removal action", () => {
    assert.match(tileSource, /const \[confirming, setConfirming\] = useState\(false\)/);
    assert.match(tileSource, /onClick=\{\(\) => \{ setMessage\(null\); setConfirming\(true\); setUnlinkedActionRevealed\(false\); \}\}/);
    assert.match(tileSource, /\{confirming \? createPortal\([\s\S]*role="alertdialog"/);
    assert.match(tileSource, /onClick=\{\(\) => setConfirming\(false\)\}>Отмена/);
    assert.match(tileSource, /onClick=\{submit\}>\{pending \? "Сохраняем…" : "Убрать"\}/);

    const submitStart = tileSource.indexOf("function submit()");
    const confirmationStart = tileSource.indexOf("{confirming ? createPortal(");
    assert.notEqual(submitStart, -1);
    assert.notEqual(confirmationStart, -1);
    assert.ok(submitStart < confirmationStart);
    assert.match(
      tileSource.slice(submitStart, confirmationStart),
      /await removeAuthorSeriesMediaLinkAction\(\{ franchiseCode, mediaItemCode: item\.code \}\)/,
    );
  });

  it("hides the action on desktop until hover and reveals it after a mobile left swipe", () => {
    assert.match(tileSource, /md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100/);
    assert.match(tileSource, /md:focus-within:pointer-events-auto md:focus-within:opacity-100/);
    assert.match(tileSource, /max-md:focus-within:pointer-events-auto max-md:focus-within:opacity-100/);
    assert.match(tileSource, /event\.clientX - pointerStartX\.current < -40/);
    assert.match(tileSource, /setUnlinkedActionRevealed\(true\)/);
    assert.match(tileSource, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  });

  it("cancels interrupted gestures and prevents a completed swipe from navigating the tile link", () => {
    assert.match(tileSource, /className="group relative min-w-0 touch-pan-y"/);
    assert.match(
      tileSource,
      /event\.pointerType === "mouse" && window\.matchMedia\("\(min-width: 1280px\)"\)\.matches/,
    );
    assert.match(tileSource, /onPointerCancel=\{\(event\) => \{[\s\S]*pointerStartX\.current = null;[\s\S]*didSwipeToReveal\.current = false/);
    assert.match(tileSource, /onClickCapture=\{\(event\) => \{[\s\S]*if \(!didSwipeToReveal\.current\) return;[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*didSwipeToReveal\.current = false/);
    assert.match(tileSource, /event\.currentTarget\.releasePointerCapture\(event\.pointerId\)/);
  });

  it("reports either immediate removal or a request for review from the shared action result", () => {
    assert.match(tileSource, /result\.removalStatus === "requested" \? "Запрос на удаление отправлен на проверку\." : "Связь с серией удалена\."/);
    assert.match(tileSource, /canPublishFranchisesWithoutReview \? "Связь записи с серией будет удалена сразу\." : "Будет создана заявка на удаление связи записи с серией\."/);
    assert.doesNotMatch(tileSource, /requestAuthorMediaItemFranchiseRemoval|\.delete\(/);
  });
});
