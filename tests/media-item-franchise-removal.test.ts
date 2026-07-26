import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync("drizzle/0039_media_item_franchise_removal_requests.sql", "utf8");
const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const franchiseQueriesSource = readFileSync("src/db/queries/franchises.ts", "utf8");
const mediaItemQueriesSource = readFileSync("src/db/queries/media-items.ts", "utf8");
const mediaActionsSource = readFileSync("src/app/media/franchise-actions.ts", "utf8");
const seriesActionsSource = readFileSync("src/app/series/[code]/actions.ts", "utf8");
const seriesSearchSource = readFileSync("src/app/series/[code]/series-media-link-search.tsx", "utf8");
const reviewActionsSource = readFileSync("src/app/admin/(protected)/franchise-review/actions.ts", "utf8");
const reviewPageSource = readFileSync("src/app/admin/(protected)/franchise-review/page.tsx", "utf8");
const suggestionDialogSource = readFileSync("src/app/media-item-franchise-suggestion-dialog.tsx", "utf8");

function getFunctionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return source.slice(start, end);
}

describe("media item franchise removal requests", () => {
  it("persists one request per link and cascades it with the link or author", () => {
    assert.match(migrationSource, /CREATE TABLE "media_item_franchise_removal_requests"/);
    assert.match(migrationSource, /PRIMARY KEY\("media_item_id", "franchise_id"\)/);
    assert.match(migrationSource, /REFERENCES "media_item_franchises"\("media_item_id", "franchise_id"\) ON DELETE cascade/);
    assert.match(migrationSource, /REFERENCES "authors"\("id"\) ON DELETE cascade/);
    assert.match(schemaSource, /primaryKey\(\{[\s\S]*mediaItemFranchiseRemovalRequestsPk|media_item_franchise_removal_requests_pk/);
    assert.match(schemaSource, /foreignColumns: \[mediaItemFranchises\.mediaItemId, mediaItemFranchises\.franchiseId\][\s\S]*\.onDelete\("cascade"\)/);
  });

  it("allows only the link author to withdraw an unpublished link or remove a published link with permission", () => {
    const removalQuery = getFunctionSource(
      franchiseQueriesSource,
      "requestAuthorMediaItemFranchiseRemoval",
      "createAuthorFranchiseWithMediaItemLink",
    );

    assert.match(removalQuery, /link\.createdByAuthorId !== input\.authorId/);
    assert.match(removalQuery, /if \(link\.publicationStatus !== "published"\) \{[\s\S]*delete\(mediaItemFranchises\)/);
    assert.match(removalQuery, /if \(input\.canPublishFranchisesWithoutReview\) \{[\s\S]*delete\(mediaItemFranchises\)/);
    assert.match(removalQuery, /insert\(mediaItemFranchiseRemovalRequests\)[\s\S]*onConflictDoNothing\(\)/);
    assert.match(removalQuery, /return \{ status: "requested" as const \}/);
  });

  it("exposes one global pending removal for a linked series in the media-item DTO", () => {
    assert.match(mediaItemQueriesSource, /removalRequested\?: boolean/);
    assert.match(mediaItemQueriesSource, /'removalRequested', \$\{currentAuthorId/);
    assert.match(mediaItemQueriesSource, /mediaItemFranchiseRemovalRequests\.mediaItemId\} = \$\{mediaItemFranchises\.mediaItemId\}/);
    assert.match(mediaItemQueriesSource, /mediaItemFranchiseRemovalRequests\.franchiseId\} = \$\{mediaItemFranchises\.franchiseId\}/);
    assert.doesNotMatch(mediaItemQueriesSource, /mediaItemFranchiseRemovalRequests\.requestedByAuthorId\} = \$\{currentAuthorId\}/);
    assert.match(mediaItemQueriesSource, /: sql`false`/);
  });

  it("routes review approval to deletion and rejection to request cancellation", () => {
    const reviewQuery = getFunctionSource(
      franchiseQueriesSource,
      "reviewMediaItemFranchiseRemovalRequest",
      "createAuthorMediaItemFranchiseLinks",
    );

    assert.match(reviewQuery, /delete\(mediaItemFranchiseRemovalRequests\)/);
    assert.match(reviewQuery, /if \(input\.decision === "published"\) \{[\s\S]*delete\(mediaItemFranchises\)/);
    assert.doesNotMatch(reviewQuery.slice(reviewQuery.indexOf('if (input.decision === "published")')), /else[\s\S]*delete\(mediaItemFranchises\)/);
    assert.match(reviewActionsSource, /kind === "removal"[\s\S]*reviewMediaItemFranchiseRemovalRequest\(\{ decision, franchiseId, mediaItemId \}\)/);
    assert.match(reviewPageSource, /name="kind" value="removal"/);
    assert.match(reviewPageSource, /Запрос на отвязку существующей серии/);
    assert.match(reviewPageSource, /Link2, Unlink/);
    assert.match(reviewPageSource, /franchise\.kind === "removal" \? <Unlink className="size-5" \/> : <Link2 className="size-5" \/>/);
    assert.match(reviewPageSource, /bg-red-50 text-red-700/);
    assert.match(reviewPageSource, /bg-emerald-50 text-emerald-700/);
  });

  it("stages direct-tag removal in the public dialog and submits it through the single suggestion form", () => {
    const submitStart = mediaActionsSource.indexOf("export async function submitAuthorMediaItemFranchiseSuggestionAction");
    const submitSource = mediaActionsSource.slice(submitStart);

    assert.notEqual(submitStart, -1);
    assert.match(suggestionDialogSource, /franchise\.removalRequested \? <span[\s\S]*на удалении/);
    assert.match(suggestionDialogSource, /const \[franchiseRemovalIds, setFranchiseRemovalIds\] = useState<string\[\]>\(\[\]\)/);
    assert.match(suggestionDialogSource, /<Trash2 className="size-3\.5" \/>/);
    assert.match(suggestionDialogSource, /setFranchiseRemovalIds\(\(ids\) => \[\.\.\.ids, String\(franchise\.id\)\]\)/);
    assert.match(suggestionDialogSource, /franchiseRemovalIds\.includes\(String\(franchise\.id\)\)[\s\S]*setFranchiseRemovalIds\(\(ids\) => ids\.filter[\s\S]*Отменить удаление серии/);
    assert.match(suggestionDialogSource, /franchiseRemovalIds\.map\(\(id\) => <input key=\{id\} type="hidden" name="franchiseRemovalIds" value=\{id\} \/>\)/);
    assert.match(suggestionDialogSource, /type="submit"[\s\S]*form="media-franchise-suggestion-form"/);
    assert.doesNotMatch(suggestionDialogSource, /window\.confirm|removeAuthorMediaItemFranchiseAction|requestAuthorMediaItemFranchiseRemoval/);
    assert.equal(suggestionDialogSource.match(/createPortal\(/g)?.length, 2);

    assert.match(submitSource, /formData\.getAll\("franchiseRemovalIds"\)/);
    assert.match(submitSource, /for \(const franchiseId of removalIds\) \{[\s\S]*requestAuthorMediaItemFranchiseRemoval/);
    assert.match(submitSource, /mode === "existing" && franchiseIds\.length === 0 && removalIds\.length === 0/);
    assert.match(submitSource, /if \(franchiseIds\.length > 0\) \{[\s\S]*createAuthorMediaItemFranchiseLinks/);
  });

  it("requires confirmation before submitting staged removals through the original form", () => {
    assert.match(suggestionDialogSource, /const \[removalConfirmationOpen, setRemovalConfirmationOpen\] = useState\(false\)/);
    assert.match(suggestionDialogSource, /const removalConfirmedRef = useRef\(false\)/);
    assert.match(
      suggestionDialogSource,
      /onSubmit=\{\(event\) => \{[\s\S]*franchiseRemovalIds\.length > 0 && !removalConfirmedRef\.current[\s\S]*event\.preventDefault\(\);[\s\S]*setRemovalConfirmationOpen\(true\)/,
    );
    assert.match(suggestionDialogSource, /\{open && removalConfirmationOpen \? createPortal\([\s\S]*role="alertdialog"[\s\S]*Подтвердить удаление серий\?/);
    assert.match(suggestionDialogSource, /onClick=\{\(\) => setRemovalConfirmationOpen\(false\)\}>Вернуться/);
    assert.match(
      suggestionDialogSource,
      /function submitAfterRemovalConfirmation\(\) \{[\s\S]*removalConfirmedRef\.current = true;[\s\S]*setRemovalConfirmationOpen\(false\);[\s\S]*formRef\.current\?\.requestSubmit\(\);/,
    );
    assert.match(suggestionDialogSource, /onClick=\{submitAfterRemovalConfirmation\}>Сохранить изменения/);
  });

  it("returns removal status to the series search", () => {
    assert.match(seriesActionsSource, /requestAuthorMediaItemFranchiseRemoval\([\s\S]*canPublishFranchisesWithoutReview: author\.canPublishFranchisesWithoutReview/);
    assert.match(seriesActionsSource, /removalStatus = removedLink\.status/);
    assert.match(seriesActionsSource, /return \{ error: null, linkStatus: null, removalStatus, success: true \}/);
    assert.match(seriesSearchSource, /result\.removalStatus === "requested"[\s\S]*отправлен на проверку/);
  });
});
