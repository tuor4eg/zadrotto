import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { creatorAutoApprovalNameParts, escapeCreatorNameLike, escapeCreatorNameRegex, matchesCreatorAutoApprovalName } from "../src/lib/creators/auto-approval-name";
import { getCreatorAutoApprovalCandidates } from "../src/db/queries/creator-auto-approval-candidates";
import type { CreatorTransaction } from "../src/db/queries/creators";

test("auto-approval names normalize and match full substrings even for one word", () => {
    assert.equal(matchesCreatorAutoApprovalName("  ЁЖ  ", [null, "Студия Ежик"]), true);
    assert.equal(matchesCreatorAutoApprovalName("Anna Bell", ["Anna Belle"]), true);
    assert.equal(matchesCreatorAutoApprovalName(" ", ["anything"]), false);
});

test("two distinct whole words can be distributed across one creator's variants", () => {
    assert.equal(matchesCreatorAutoApprovalName("John Ronald Tolkien", ["John Smith", "Ronald Jones"]), true);
    assert.equal(matchesCreatorAutoApprovalName("John Ronald Tolkien", ["Johnson Ronald"]), false);
    assert.equal(matchesCreatorAutoApprovalName("John John", ["John Smith"]), false);
    assert.equal(matchesCreatorAutoApprovalName("Иван Петр Сергеев", ["Иван-Петр"]), true);
    assert.deepEqual(creatorAutoApprovalNameParts("Ёж ёж, ЕЖ").words, ["еж"]);
});

test("literal wildcard and regular expression punctuation stays literal", () => {
    assert.equal(escapeCreatorNameLike("a%_\\b"), "a\\%\\_\\\\b");
    assert.equal(escapeCreatorNameRegex("a+b.[c](d)"), "a\\+b\\.\\[c\\]\\(d\\)");
    assert.equal(matchesCreatorAutoApprovalName("100%", ["1000"]), false);
});

test("candidate SQL includes every name source and active bindings with bounded diagnostics", async () => {
    let compiled: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const tx = { execute: async (query: SQL) => {
        compiled = new PgDialect().sqlToQuery(query);
        return [{ id: 1, name: "Example" }];
    } } as unknown as CreatorTransaction;
    assert.deepEqual(await getCreatorAutoApprovalCandidates(tx, "John Ronald %_"), [{ id: 1, name: "Example" }]);
    assert.ok(compiled);
    for (const field of ["name_ru", "original_name", "provider_creator_mappings", "provider_creator_bindings", "active"]) assert.ok(compiled.sql.includes(field));
    assert.match(compiled.sql, /count\(distinct word\) >= 2/);
    assert.match(compiled.sql, /limit 10/);
    assert.ok(compiled.params.includes("%john ronald \\%\\_%"));
    assert.ok(compiled.params.includes("\\mjohn\\M"));
    await getCreatorAutoApprovalCandidates(tx, "John");
    assert.ok(compiled);
    assert.match(compiled.sql, /select distinct creator_id from/);
    assert.doesNotMatch(compiled.sql, /count\(distinct word\)/);
    compiled = undefined;
    assert.deepEqual(await getCreatorAutoApprovalCandidates(tx, " "), []);
    assert.equal(compiled, undefined);
});
