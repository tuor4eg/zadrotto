import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyReviewReactionCounts,
  emptyReviewReactionSummary,
  isReviewReactionType,
  REVIEW_REACTION_TYPES,
} from "../src/lib/reviews/reactions";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("src/db/schema.ts");
const migration = read("drizzle/0093_review_reactions.sql");
const queries = read("src/db/queries/review-reactions.ts");
const reviewQueries = read("src/db/queries/contribution-reviews.ts");
const collectionRoute = read("src/app/api/reviews/[id]/reactions/route.ts");
const mutationRoute = read("src/app/api/reviews/[id]/reactions/[type]/route.ts");
const article = read("src/app/review-article.tsx");
const catalogRow = read("src/app/reviews/review-catalog-row.tsx");

describe("review reaction model", () => {
  it("supports a generic reaction contract with like as the first type", () => {
    assert.deepEqual(REVIEW_REACTION_TYPES, ["like"]);
    assert.equal(isReviewReactionType("like"), true);
    assert.equal(isReviewReactionType("useful"), false);
    assert.deepEqual(emptyReviewReactionCounts(), { like: 0 });
    assert.deepEqual(emptyReviewReactionSummary(), {
      like: { count: 0, reactedByCurrentUser: false },
    });
  });

  it("stores reactions with cascade foreign keys, type check, and composite uniqueness", () => {
    assert.match(schema, /export const reviewReactions = pgTable/);
    assert.match(schema, /columns:\s*\[table\.reviewId, table\.type, table\.userId\]/);
    assert.match(schema, /review_reactions_user_id_idx/);
    assert.match(schema, /review_reactions_type_check/);
    assert.match(migration, /PRIMARY KEY\("review_id","type","user_id"\)/);
    assert.match(migration, /REFERENCES "public"\."contribution_reviews"\("contribution_id"\) ON DELETE cascade/);
    assert.match(migration, /REFERENCES "public"\."authors"\("id"\) ON DELETE cascade/);
    assert.match(migration, /CHECK \("review_reactions"\."type" in \('like'\)\)/);
    assert.match(migration, /CREATE INDEX "review_reactions_user_id_idx"/);
  });
});

describe("review reaction data and API", () => {
  it("keeps mutations idempotent and rejects own or unavailable reviews", () => {
    assert.match(queries, /eq\(contributions\.status, PUBLISHED_CONTRIBUTION_STATUS\)/);
    assert.match(queries, /eq\(mediaItems\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(queries, /target\.authorId === input\.userId/);
    assert.match(queries, /onConflictDoNothing\(\)/);
    assert.match(queries, /delete\(reviewReactions\)[\s\S]*eq\(reviewReactions\.type, input\.type\)/);
    assert.match(queries, /getReactionSummaryInTransaction/);
  });

  it("exposes public summary and authenticated typed mutations", () => {
    assert.match(collectionRoute, /export async function GET/);
    assert.match(collectionRoute, /userId: author\?\.id \?\? null/);
    assert.match(mutationRoute, /export async function PUT/);
    assert.match(mutationRoute, /export async function DELETE/);
    assert.match(mutationRoute, /isReviewReactionType\(typeValue\)/);
    assert.match(mutationRoute, /status: 400/);
    assert.match(mutationRoute, /status: 401/);
    assert.match(mutationRoute, /status: 403/);
    assert.match(mutationRoute, /status: 404/);
    assert.match(mutationRoute, /Response\.json\(\{ reactions: result\.reactions \}\)/);
  });

  it("returns generic reaction fields without per-row reaction queries", () => {
    assert.match(reviewQueries, /reactions: ReviewReactionSummary/);
    assert.match(reviewQueries, /reactionCounts: \{ like: likeCount \}/);
    assert.match(reviewQueries, /reviewReactionCountSql\(contributions\.id, "like"\)/);
  });
});

describe("review reaction UI", () => {
  it("uses server-confirmed state and the existing login modal", () => {
    assert.match(article, /fetch\(/);
    assert.match(article, /\/api\/reviews\/\$\{review\.id\}\/reactions\/like/);
    assert.match(article, /setReactions\(payload\.reactions\)/);
    assert.match(article, /reactionPending \? \([\s\S]*LoaderCircle/);
    assert.match(article, /!authenticated[\s\S]*setLoginOpen\(true\)/);
    assert.match(article, /<AuthorLoginModal/);
    assert.match(article, /canEdit \? \([\s\S]*Лайков:/);
  });

  it("shows a static count next to the catalog score", () => {
    assert.match(catalogRow, /Heart[\s\S]*item\.reactionCounts\.like[\s\S]*formatScore\(item\.authorScore\)/);
  });
});
