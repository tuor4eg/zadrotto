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
      /\) : \([\s\S]*<MediaItemTile key=\{item\.id\}/,
    );
    assert.match(
      pageSource,
      /<MediaItemTile key=\{item\.id\} currentAuthorScore=\{currentAuthor \? item\.currentAuthorScore : undefined\}/,
    );
    assert.match(
      queriesSource,
      /hasDirectFranchiseLink: sql<boolean>`bool_or\(\$\{mediaItemFranchises\.franchiseId\} = \$\{franchiseId\}\)`/,
    );
  });

  it("places the unlink affordance at the tile's top-left corner", () => {
    assert.match(tileSource, /<div className="relative min-w-0">/);
    assert.match(tileSource, /className="absolute left-1\.5 top-1\.5 z-30/);
    assert.match(tileSource, /<ArchiveTooltip label="Удалить из серии" side="right"/);
    assert.match(tileSource, /aria-label=\{`Удалить запись \$\{item\.title\} из серии`\}/);
    assert.match(tileSource, /<Unlink className="size-3\.5" \/>/);
  });

  it("opens confirmation before invoking the existing removal action", () => {
    assert.match(tileSource, /const \[confirming, setConfirming\] = useState\(false\)/);
    assert.match(tileSource, /onClick=\{\(\) => \{ setMessage\(null\); setConfirming\(true\); \}\}/);
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

  it("reports either immediate removal or a request for review from the shared action result", () => {
    assert.match(tileSource, /result\.removalStatus === "requested" \? "Запрос на удаление отправлен на проверку\." : "Связь с серией удалена\."/);
    assert.match(tileSource, /canPublishFranchisesWithoutReview \? "Связь записи с серией будет удалена сразу\." : "Будет создана заявка на удаление связи записи с серией\."/);
    assert.doesNotMatch(tileSource, /requestAuthorMediaItemFranchiseRemoval|\.delete\(/);
  });
});
