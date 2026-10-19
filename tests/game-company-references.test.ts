import assert from "node:assert/strict";
import { test } from "node:test";
import { getIgdbCompanyReferences, getRawgCompanyReferences } from "../src/lib/creators/game-company-references";

test("IGDB company identity is shared across roles; names never merge identities", () => {
  assert.deepEqual(getIgdbCompanyReferences([
    {developer:true,publisher:true,company:{id:12,name:"Same"}},
    {developer:true,company:{id:13,name:"Same"}},
    {developer:true,company:{id:12,name:"Same"}},
  ]),[
    {externalId:"company:12",name:"Same",roleCode:"developer"},
    {externalId:"company:12",name:"Same",roleCode:"publisher"},
    {externalId:"company:13",name:"Same",roleCode:"developer"},
  ]);
});
test("RAWG numeric IDs belong to separate namespaces",()=>{
  const refs=getRawgCompanyReferences({developers:[{id:1,name:"Same"}],publishers:[{id:1,name:"Same"}]})!;
  assert.deepEqual(refs.map(row=>row.externalId),["developer:1","publisher:1"]);
});
test("missing, empty and invalid participants are distinguished",()=>{
  assert.equal(getIgdbCompanyReferences(undefined),undefined);
  assert.deepEqual(getIgdbCompanyReferences([]),[]);
  assert.equal(getIgdbCompanyReferences([{developer:true,company:{name:"Missing ID"}}]),undefined);
  assert.equal(getRawgCompanyReferences({developers:[]}),undefined);
  assert.deepEqual(getRawgCompanyReferences({developers:[],publishers:[]}),[]);
  assert.equal(getRawgCompanyReferences({developers:[{id:0,name:"Invalid"}],publishers:[]}),undefined);
});
