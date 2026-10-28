import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSnapshotDifferences } from "../src/lib/providers/snapshot-diff";
import { SnapshotDifferences } from "../src/components/admin/snapshot-differences";

test("snapshot differences show only modified leaves and distinguish absent fields from null", () => {
  assert.deepEqual(getSnapshotDifferences({unchanged:7,details:{age:10},gone:null},{unchanged:7,details:{age:12},new:null}),[
    {path:"details.age",kind:"changed",current:10,proposed:12},
    {path:"gone",kind:"removed",current:null},
    {path:"new",kind:"added",proposed:null},
  ]);
  assert.deepEqual(getSnapshotDifferences({a:null},{a:[]}),[{path:"a",kind:"changed",current:null,proposed:[]}]);
});

test("list ordering and stable creator identities do not generate shifted-row noise", () => {
  assert.deepEqual(getSnapshotDifferences(["A","B"],["B","A"]),[]);
  assert.deepEqual(getSnapshotDifferences(["A","A"],["A"]),[{path:"[1]",kind:"removed",current:"A"}]);
  const old = [{externalId:"1",roleCode:"artist",name:"A"},{externalId:"1",roleCode:"designer",name:"B"}];
  const proposed = [{externalId:"2",roleCode:"artist",name:"New"},{...old[1]},{...old[0],name:"Changed"}];
  const changes = getSnapshotDifferences(old,proposed);
  assert.equal(changes.length,2);
  assert.deepEqual(changes[0],{path:"[0].name",kind:"changed",current:"A",proposed:"Changed"});
  assert.equal(changes[1].kind,"added");
  assert.deepEqual(getSnapshotDifferences([{value:1}],[{value:2}]),[{path:"[0].value",kind:"changed",current:1,proposed:2}]);
});

test("difference cards show old/new values and safely render provider text", () => {
  const html = renderToStaticMarkup(createElement(SnapshotDifferences,{current:{age:10,unchanged:7},proposed:{age:12,unchanged:7,new:"<script>bad</script>"}}));
  assert.match(html,/Конкретные отличия · 2/);
  assert.match(html,/Изменено.*age/);
  assert.match(html,/Сейчас в записи/);
  assert.match(html,/В снимке провайдера/);
  assert.match(html,/Нет поля/);
  assert.doesNotMatch(html,/unchanged|<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(renderToStaticMarkup(createElement(SnapshotDifferences,{current:{age:10},proposed:{age:10}})),/Различий в показанных значениях нет/);
});
