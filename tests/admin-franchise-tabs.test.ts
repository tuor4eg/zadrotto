import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/admin/(protected)/series/[id]/edit/page.tsx", "utf8");
const actions = readFileSync("src/app/admin/(protected)/series/actions.ts", "utf8");
const queries = readFileSync("src/db/queries/franchises.ts", "utf8");
const childrenTab = readFileSync("src/app/admin/(protected)/series/[id]/edit/children-tab.tsx", "utf8");
const childPicker = readFileSync("src/app/admin/(protected)/series/[id]/edit/child-picker.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return source.slice(start, end);
}

test("admin franchise edit separates edit, media and children tabs", () => {
  assert.match(page, /const tab = query\.tab === "media" \|\| query\.tab === "children" \? query\.tab : "edit"/);
  assert.match(page, /\[\['edit', 'Редактирование'\], \['media', 'Записи'\], \['children', 'Потомки'\]\]/);
  assert.match(page, /href=\{`\/admin\/series\/\$\{franchise\.id\}\/edit\?tab=\$\{value\}`\}/);
  assert.match(page, /tab === "edit" \? <section/);
  assert.match(page, /tab === "media" \? <Card>/);
  assert.match(page, /tab === "children" \? <FranchiseChildrenTab/);
  assert.match(page, /tab === "children" \? getAdminFranchiseChildCandidates\(franchiseId\) : Promise\.resolve\(\[\]\)/);
  assert.match(page, /tab === "children" \? getAdminFranchiseDescendantTree\(franchiseId\) : Promise\.resolve\(\[\]\)/);
  assert.match(childrenTab, /Текущие потомки/);
  assert.match(childrenTab, /function DescendantTable/);
  assert.match(childrenTab, /<TableWrap>[\s\S]*<Table className="table-fixed">/);
  assert.match(childrenTab, /<Badge variant="outline">\{node\.mediaItemsCount\}<\/Badge>/);
  assert.match(childrenTab, /buttonVariants\(\{ variant: "outline", size: "icon" \}\)/);
  assert.match(childrenTab, /<ConfirmAction[\s\S]*action=\{deleteFranchiseChildAction\}/);
  assert.match(childrenTab, /const canDelete = node\.mediaItemsCount === 0 && node\.children\.length === 0/);
  assert.match(childrenTab, /disabled=\{!canDelete\}/);
});

test("child candidates exclude the current series, every ancestor and every descendant", () => {
  const childCandidates = sourceBetween(
    queries,
    "export async function getAdminFranchiseChildCandidates",
    "export async function hasAdminFranchiseChildren",
  );

  assert.match(childCandidates, /const related = new Set<number>\(\[franchiseId\]\)/);
  assert.match(childCandidates, /let ancestorId = byId\.get\(franchiseId\)\?\.parentId \?\? null/);
  assert.match(childCandidates, /while \(ancestorId\) \{ related\.add\(ancestorId\)/);
  assert.match(childCandidates, /for \(const row of rows\) \{[\s\S]*if \(parentId === franchiseId\) \{ related\.add\(row\.id\); break; \}/);
  assert.match(childCandidates, /rows\.filter\(\(row\) => !related\.has\(row\.id\)\)/);
});

test("children tab validates duplicates before creating and provides the parent id to both forms", () => {
  assert.match(childrenTab, /<form action=\{moveFranchiseChildAction\}[\s\S]*name="parentId" value=\{franchiseId\}/);
  assert.match(childrenTab, /<form action=\{createFranchiseChildAction\}[\s\S]*name="parentId" value=\{franchiseId\}/);
  assert.match(childrenTab, /<FranchiseDuplicateCheck title=\{title\} originalTitle=\{originalTitle\} onBlockedChange=\{setDuplicateBlocked\}/);
  assert.match(childrenTab, /type="submit" disabled=\{duplicateBlocked\}[\s\S]*Создать дочернюю серию/);
  assert.match(childPicker, /<SearchableFranchiseSelect[^>]*name="childId"[^>]*searchByTitleOnly/);

  const createChild = sourceBetween(actions, "export async function createFranchiseChildAction", "export async function deleteFranchiseAction");
  assert.match(createChild, /const duplicateCheck = await validateFranchiseDuplicateCheck\(formData, input\.value\)/);
  assert.match(createChild, /if \(!duplicateCheck\.ok\) redirect\(\`\/admin\/series\/\$\{parentId\.value\}\/edit\?tab=children&error=\$\{duplicateCheck\.error\}\`\)/);
  assert.match(createChild, /createFranchise\(\{ \.\.\.input\.value, parentId: parent\.id,/);
  assert.match(createChild, /edit\?tab=children&childCreated=1/);
});

test("moving a child reuses guarded hierarchy updates and deletion is blocked by children", () => {
  const moveChild = sourceBetween(actions, "export async function moveFranchiseChildAction", "export async function createFranchiseChildAction");
  const update = sourceBetween(queries, "export async function updateFranchise", "export async function deleteFranchiseIfEmpty");
  const deletion = sourceBetween(queries, "export async function deleteFranchiseIfEmpty", "export async function getMediaItemsByFranchiseId");

  assert.match(moveChild, /const moved = await updateFranchise\(\{/);
  assert.match(moveChild, /parentId: parent\.id/);
  assert.match(moveChild, /edit\?tab=children&childMoved=1/);
  assert.match(update, /if \(ancestorId === input\.id\) throw new Error\("franchise-parent-cycle"\)/);
  assert.match(page, /const canDelete = mediaItems\.length === 0 && !hasChildren/);
  assert.match(page, /tab === "edit" \? hasAdminFranchiseChildren\(franchiseId\) : Promise\.resolve\(false\)/);
  assert.match(deletion, /notExists\([\s\S]*franchises\.parentId, id/);
});

test("media mutations retain the media tab and report their result there", () => {
  const addMedia = sourceBetween(actions, "export async function addMediaItemToFranchiseAction", "export async function removeMediaItemFromFranchiseAction");
  const removeMedia = actions.slice(actions.indexOf("export async function removeMediaItemFromFranchiseAction"));

  assert.match(addMedia, /redirect\(\`\/admin\/series\/\$\{franchiseId\.value\}\/edit\?tab=media&attached=1\`\)/);
  assert.match(addMedia, /edit\?tab=media&error=invalid-media/);
  assert.match(addMedia, /edit\?tab=media&error=\$\{getAdminFormErrorCode\(error\)\}/);
  assert.match(removeMedia, /redirect\(\`\/admin\/series\/\$\{franchiseId\.value\}\/edit\?tab=media&detached=1\`\)/);
  assert.match(removeMedia, /edit\?tab=media&error=invalid-media/);
  assert.match(removeMedia, /edit\?tab=media&error=\$\{getAdminFormErrorCode\(error\)\}/);
  assert.match(page, /query\.attached === "1"[\s\S]*Запись добавлена в серию\./);
  assert.match(page, /query\.detached === "1"[\s\S]*Запись убрана из серии\./);
  assert.match(page, /query\.error \? <p[\s\S]*getFranchiseErrorMessage\(query\.error\)/);
  assert.match(page, /query\.childDeleted === "1" \? "Дочерняя серия удалена\."/);
});
