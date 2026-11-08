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

test("exact organization candidates use normalized equality, all aliases and a two-owner ambiguity bound", async () => {
    let compiled: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const tx = { execute: async (query: SQL) => {
        compiled = new PgDialect().sqlToQuery(query);
        return [{ id: 7, name: "Scott Free Productions" }];
    } } as unknown as CreatorTransaction;
    assert.deepEqual(await getCreatorAutoApprovalCandidates(tx, " SCOTT Free Productions ", { exactOrganization: true }), [{ id: 7, name: "Scott Free Productions" }]);
    assert.ok(compiled);
    assert.ok(compiled.params.includes("scott free productions"));
    assert.match(compiled.sql, /creator_types/);
    assert.match(compiled.sql, /limit 2/);
    assert.doesNotMatch(compiled.sql, / like |count\(distinct word\)/);
    for (const field of ["name_ru", "original_name", "provider_creator_mappings", "provider_creator_bindings", "active"]) assert.ok(compiled.sql.includes(field));
});


test("generic company words do not count toward organization duplicate detection", () => {
    for (const [name, other] of [
        ["A Film Group", "B Film Group"],
        ["Alpha Entertainment Production Animation Inc", "Beta Entertainment Production Animation Inc"],
        ["Alpha Pictures Studios International Ltd", "Beta Pictures Studios International Ltd"],
        ["ООО Кинокомпания Альфа Продакшн", "ООО Кинокомпания Бета Продакшн"],
    ]) assert.equal(matchesCreatorAutoApprovalName(name, [other], true), false);
    assert.equal(matchesCreatorAutoApprovalName("A Film Group", ["B Film Group"]), true);
    assert.equal(matchesCreatorAutoApprovalName("Scott Free Films", ["Free Scott Productions"], true), true);
    assert.equal(matchesCreatorAutoApprovalName("Film Group", ["Film Group"], true), true);
    assert.equal(matchesCreatorAutoApprovalName("A Film Group", ["A Film Group International"], true), true);
    assert.deepEqual(creatorAutoApprovalNameParts("FILM Films INC. Animation", true).words, []);
});

test("organization SQL omits common token branches but preserves full-name checks", async () => {
    let compiled: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const tx = { execute: async (query: SQL) => {
        compiled = new PgDialect().sqlToQuery(query);
        return [];
    } } as unknown as CreatorTransaction;
    await getCreatorAutoApprovalCandidates(tx, "A Film Group", { organization: true });
    assert.ok(compiled);
    assert.ok(compiled.params.includes("%a film group%"));
    assert.doesNotMatch(compiled.sql, /count\(distinct word\)/);
    await getCreatorAutoApprovalCandidates(tx, "Scott Free Film Group", { organization: true });
    assert.ok(compiled);
    assert.ok(compiled.params.includes("\\mscott\\M"));
    assert.ok(compiled.params.includes("\\mfree\\M"));
    assert.ok(!compiled.params.includes("\\mfilm\\M"));
    assert.ok(!compiled.params.includes("\\mgroup\\M"));
    assert.match(compiled.sql, /count\(distinct word\) >= 2/);
});


test("organization full names respect word boundaries and literal punctuation", async () => {
    for (const name of ["Perfect World Entertainment", "Threshold Entertainment", "Emerald Entertainment LLC", "LD Entertainments", "OLD Entertainment"]) {
        assert.equal(matchesCreatorAutoApprovalName("LD Entertainment", [name], true), false, name);
    }
    for (const name of ["LD Entertainment", "LD Entertainment LLC", "The LD Entertainment", "(LD Entertainment)"]) {
        assert.equal(matchesCreatorAutoApprovalName("LD Entertainment", [name], true), true, name);
    }
    assert.equal(matchesCreatorAutoApprovalName("Кот", ["Скот"], true), false);
    assert.equal(matchesCreatorAutoApprovalName("Кот", ["Студия Кот"], true), true);
    assert.equal(matchesCreatorAutoApprovalName("A+B Inc.", ["AAB Inc."], true), false);
    assert.equal(matchesCreatorAutoApprovalName("A+B Inc.", ["(A+B Inc.)"], true), true);
    assert.equal(matchesCreatorAutoApprovalName("LD Entertainment", ["World Entertainment"]), true);
    let compiled: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const tx = { execute: async (query: SQL) => {
        compiled = new PgDialect().sqlToQuery(query);
        return [];
    } } as unknown as CreatorTransaction;
    await getCreatorAutoApprovalCandidates(tx, "LD Entertainment", { organization: true });
    assert.ok(compiled);
    assert.ok(compiled.params.includes("%ld entertainment%"));
    assert.ok(compiled.params.includes("(^|[^[:alnum:]_])ld entertainment($|[^[:alnum:]_])"));
    assert.match(compiled.sql, / like /);
    assert.match(compiled.sql, / ~ /);
});


test("candidate type filtering excludes person/company collisions before the diagnostic limit", async () => {
    let compiled: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const tx = { execute: async (query: SQL) => {
        compiled = new PgDialect().sqlToQuery(query);
        return [];
    } } as unknown as CreatorTransaction;
    for (const organization of [false, true]) {
        await getCreatorAutoApprovalCandidates(tx, "Shared Name", { organization });
        assert.ok(compiled);
        assert.match(compiled.sql, /join "creator_types"/);
        assert.match(compiled.sql, /where "creator_types"\."code" <> \$\d+\s+limit 10/);
        assert.equal(compiled.params.at(-1), organization ? "person" : "organization");
    }
});
