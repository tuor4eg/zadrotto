import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync(
  "src/app/author/(protected)/media/actions.ts",
  "utf8",
);
const dialogSource = readFileSync(
  "src/app/author/(protected)/media/inline-franchise-dialog.tsx",
  "utf8",
);
const formSource = readFileSync(
  "src/app/author/(protected)/media/media-item-form.tsx",
  "utf8",
);
const messagesSource = readFileSync(
  "src/app/author/(protected)/media/messages.ts",
  "utf8",
);
const franchisesQuerySource = readFileSync("src/db/queries/franchises.ts", "utf8");

const inlineActionStart = actionsSource.indexOf(
  "export async function createAuthorInlineFranchiseAction",
);
const nextActionStart = actionsSource.indexOf(
  "\nexport async function ",
  inlineActionStart + 1,
);
const inlineActionSource = actionsSource.slice(
  inlineActionStart,
  nextActionStart === -1 ? actionsSource.length : nextActionStart,
);

describe("author inline franchise parent selection", () => {
  it("renders a parent selector with published franchise options", () => {
    assert.match(
      formSource,
      /<InlineFranchiseDialog[\s\S]*options=\{franchiseOptions\.filter\([\s\S]*franchise\.publicationStatus === "published"/,
    );
    assert.match(
      dialogSource,
      /<SearchableFranchiseSelect[\s\S]*name="parentId"[\s\S]*options=\{options\}[\s\S]*value=\{parentId\}[\s\S]*onChange=\{setParentId\}/,
    );
    assert.doesNotMatch(dialogSource, /searchByTitleOnly/);
  });

  it("parses and validates an optional published parent before creation", () => {
    assert.match(
      actionsSource,
      /const parentId = parseOptionalPositiveInteger\(getFormString\(formData, "parentId"\)\)/,
    );
    assert.match(
      actionsSource,
      /if \(!parentId\.ok\) \{[\s\S]*error: "invalid-franchise"/,
    );
    assert.match(
      inlineActionSource,
      /input\.value\.parentId[\s\S]*getPublishedFranchiseOptionById\(input\.value\.parentId\)[\s\S]*if \(input\.value\.parentId && !parent\) \{[\s\S]*error: "invalid-franchise"/,
    );
    assert.match(
      inlineActionSource,
      /createFranchise\(\{[\s\S]*\.\.\.input\.value/,
    );
    assert.match(
      franchisesQuerySource,
      /export async function getPublishedFranchiseOptionById\(id: number\)[\s\S]*\.where\(publishedFranchiseCondition\)/,
    );
  });

  it("reports depth errors and returns a hierarchy-aware created option", () => {
    assert.match(
      inlineActionSource,
      /error instanceof Error && error\.message === "franchise-depth-limit"[\s\S]*error: "franchise-depth-limit"/,
    );
    assert.match(
      messagesSource,
      /error === "franchise-depth-limit"[\s\S]*максимальная глубина вложенности серий/,
    );
    assert.match(
      inlineActionSource,
      /parentIds: parent \? \[\.\.\.parent\.parentIds, parent\.id\] : \[\]/,
    );
    assert.match(
      inlineActionSource,
      /path: parent \? `\$\{parent\.path\} \/ \$\{input\.value\.title\}` : input\.value\.title/,
    );
  });
});
