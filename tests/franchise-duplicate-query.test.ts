import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/db/queries/franchises.ts", "utf8");

describe("franchise duplicate candidate query", () => {
  it("looks up an exact duplicate before limiting similar candidates", () => {
    const functionSource = source.slice(
      source.indexOf("export async function findPublishedFranchiseDuplicateCandidates"),
      source.indexOf("function adminFranchiseSearchCondition"),
    );

    assert.match(functionSource, /const \[exactMatches, similarMatches\] = await Promise\.all/);
    assert.match(functionSource, /where\(and\(publishedFranchiseCondition, exactCondition\)\)[\s\S]*?\.limit\(1\)/);
    assert.match(functionSource, /where\([\s\S]*?similarCondition[\s\S]*?\.limit\(10\)/);
    assert.ok(functionSource.indexOf("exactCondition") < functionSource.indexOf("similarCondition"));
  });
});
