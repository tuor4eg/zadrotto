import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const testUrl = process.env.QUIZ_TEST_DATABASE_URL;
test("mosaic transactions: retries, revisions, terminal event and immutable publication", { skip: !testUrl, timeout: 120000 }, async () => {
  const schema = `quiz_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "isolated-mosaic-quiz-test-secret";
  let closeApp: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const name of (await readdir("drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const migration = (await readFile(`drizzle/${name}`, "utf8")).replaceAll('"public".', `"${schema}".`).replaceAll(/\bpublic\./g, `${schema}.`);
      await client.begin(async tx => { await tx.unsafe(migration); });
    }
    process.env.DATABASE_URL = url.toString();
    const service = await import("../src/db/queries/quizzes");
    const { getDbClient } = await import("../src/db");
    closeApp = () => getDbClient().end({ timeout: 2 });
    const [profile] = await client`insert into author_access_profiles(code,name) values('quiz-test','Quiz test') returning id`;
    const [author] = await client`insert into authors(code,name,access_profile_id) values('quiz-test','Quiz test',${profile.id}) returning id`;
    const [mediaType] = await client`select code from media_types where is_publicly_available=true order by id limit 1`;
    const entries = await client`insert into media_items(code,title,media_type,publication_status) values('quiz-answer','Ответ',${mediaType.code},'published'),('quiz-wrong','Ошибка',${mediaType.code},'published') returning id`;
    const input = { type: "mosaic" as const, config: { seed: 42 }, question: null, comment: null, imageObjectKey: `quizzes/${randomUUID()}.webp`, answerMediaItemId: entries[0].id as number, mediaTypes: [mediaType.code as string], startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000), attemptLimit: 10, enabled: true };
    const classic = await service.createQuiz({ ...input, type: "classic", config: null });
    assert.equal(classic.publishedAt, null);
    await service.setQuizEnabled(classic.id, false);
    const draft = await service.updateQuiz(classic.id, { ...input, enabled: false });
    assert.equal(draft?.publishedAt, null);
    assert.ok(await service.updateQuiz(classic.id, { ...input, enabled: false, config: { seed: 43 } }));
    const quiz = await service.createQuiz(input);
    await client`insert into quiz_participants(quiz_id,author_id,attempts_remaining,mechanic_state) values(${quiz.id},${author.id},10,${client.json({ version: 1, remainingPoints: 10, openedMask: 0, wrongAnswers: 0, processedActions: [] })})`;
    const action = { type: "openCell" as const, actionId: randomUUID(), revision: 0, cellIndex: 0 };
    const concurrent = await Promise.all([service.performMosaicQuizAction(quiz.id, author.id, action), service.performMosaicQuizAction(quiz.id, author.id, action)]);
    for (const result of concurrent) {
      assert.equal(result.kind, "result");
      if (result.kind === "result") assert.equal(result.participant.mosaic?.remainingPoints, 9);
    }
    const stale = await service.performMosaicQuizAction(quiz.id, author.id, { ...action, actionId: randomUUID(), cellIndex: 1 });
    assert.equal(stale.kind, "conflict");
    const reopened = await service.performMosaicQuizAction(quiz.id, author.id, { ...action, actionId: randomUUID(), revision: 1 });
    assert.equal(reopened.kind, "result");
    if (reopened.kind === "result") assert.equal(reopened.participant.revision, 1);
    const answer = { type: "submitAnswer" as const, actionId: randomUUID(), revision: 1, titleId: entries[0].id as number };
    const completed = await service.performMosaicQuizAction(quiz.id, author.id, answer);
    assert.equal(completed.kind, "result");
    if (completed.kind === "result") assert.equal(completed.participant.points, 9);
    await service.performMosaicQuizAction(quiz.id, author.id, answer);
    const [event] = await client`select count(*)::int as count from domain_events where type='quiz.completed' and aggregate_id=${`${quiz.id}:${author.id}`}`;
    assert.equal(event.count, 1);
    assert.equal(await service.resetQuizParticipant(quiz.id, author.id), true);
    assert.equal((await service.getQuizById(quiz.id, author.id))?.participant, null);
    assert.equal((await service.getAdminQuizAggregates(quiz.id)).totalCount, 0);
    assert.equal(await service.resetQuizParticipant(quiz.id, author.id), false);
    assert.equal((await service.performMosaicQuizAction(quiz.id, author.id, answer)).kind, "not-participant");
    await service.joinActiveQuiz(author.id);
    const restarted = (await service.getQuizById(quiz.id, author.id))?.participant;
    assert.equal(restarted?.attemptsRemaining, 10);
    assert.equal(restarted?.revision, 0);
    assert.equal(restarted?.mosaic?.openedMask, 0);
    assert.equal(restarted?.completed, false);
    assert.equal(restarted?.awardedPoints, null);
    await service.setQuizEnabled(quiz.id, false);
    await assert.rejects(service.updateQuiz(quiz.id, { ...input, enabled: false, config: { seed: 43 } }), /answer-configuration-locked/);
    assert.equal((await service.checkQuizGuess(entries[0].id, author.id)).kind, "missing");
    const classicReset = await service.createQuiz({ ...input, type: "classic", config: null });
    await service.joinActiveQuiz(author.id);
    await service.checkQuizGuess(entries[1].id, author.id);
    assert.equal(await service.resetQuizParticipant(classicReset.id, author.id), true);
    assert.equal((await service.getQuizById(classicReset.id, author.id))?.participant, null);
    await service.joinActiveQuiz(author.id);
    assert.equal((await service.getQuizById(classicReset.id, author.id))?.participant?.attemptsRemaining, 10);
  } finally {
    await closeApp?.();
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 2 });
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
