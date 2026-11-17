import assert from "node:assert/strict";
import { test } from "node:test";
import { createMosaicLayout, createMosaicState, getMosaicCrop, isMosaicCellOpen, isMosaicSeed, transitionMosaic } from "../src/lib/quizzes/mosaic";
import { calculateAuthorQuizStatistics, calculateQuizPoints } from "../src/lib/quizzes/model";
import { QUIZ_MECHANICS } from "../src/lib/quizzes/mechanics";

test("version 1 layout has a stable golden sequence and all 24 unique squares", () => {
  const layout = createMosaicLayout(42);
  assert.deepEqual(layout.slice(0, 6), [
    { sourceIndex: 6, rotation: 0 }, { sourceIndex: 9, rotation: 90 },
    { sourceIndex: 20, rotation: 0 }, { sourceIndex: 16, rotation: 0 },
    { sourceIndex: 2, rotation: 270 }, { sourceIndex: 0, rotation: 180 },
  ]);
  assert.deepEqual(layout, createMosaicLayout(42));
  assert.notDeepEqual(layout, createMosaicLayout(43));
  for (const seed of [0, 1, 42, 4294967295]) {
    const squares = createMosaicLayout(seed);
    assert.deepEqual(squares.map((square) => square.sourceIndex).sort((a, b) => a - b), Array.from({ length: 24 }, (_, index) => index));
    assert.ok(squares.every((square) => [0, 90, 180, 270].includes(square.rotation)));
  }
});

test("seed validation rejects fractional, missing and out-of-range seeds", () => {
  for (const value of [null, "42", -1, 0.5, Infinity, NaN, 4294967296]) assert.equal(isMosaicSeed(value), false);
  assert.equal(QUIZ_MECHANICS.mosaic.validateConfig({}), false);
  assert.equal(QUIZ_MECHANICS.mosaic.validateConfig({ seed: 0 }), true);
  assert.throws(() => createMosaicLayout(-1));
});

test("center crop produces 2:3 with square fragments for landscape and portrait images", () => {
  assert.deepEqual(getMosaicCrop(600, 900), { x: 0, y: 0, width: 600, height: 900 });
  assert.deepEqual(getMosaicCrop(1200, 900), { x: 300, y: 0, width: 600, height: 900 });
  assert.deepEqual(getMosaicCrop(600, 1200), { x: 0, y: 150, width: 600, height: 900 });
  for (const [width, height] of [[777, 311], [99, 301], [800, 800]]) {
    const crop = getMosaicCrop(width, height);
    assert.ok(Math.abs(crop.width / 4 - crop.height / 6) < 1e-9);
  }
});

test("an opening and a wrong answer each spend one point; reopening is free", () => {
  const initial = createMosaicState();
  const opening = transitionMosaic(initial, { type: "openCell", cellIndex: 23 });
  assert.equal(opening.state.remainingPoints, 9);
  assert.equal(opening.state.wrongAnswers, 0);
  assert.equal(isMosaicCellOpen(opening.state.openedMask, 23), true);
  assert.equal(initial.openedMask, 0);
  const repeated = transitionMosaic(opening.state, { type: "openCell", cellIndex: 23 });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.state.remainingPoints, 9);
  const wrong = transitionMosaic(repeated.state, { type: "submitAnswer", correct: false });
  assert.equal(wrong.state.remainingPoints, 8);
  assert.equal(wrong.state.wrongAnswers, 1);
  const victory = transitionMosaic(wrong.state, { type: "submitAnswer", correct: true });
  assert.equal(victory.state.remainingPoints, 8);
  assert.equal(victory.outcome, "correct");
});

test("configured budget initializes participation and determines the victory score", () => {
  const initial = QUIZ_MECHANICS.mosaic.createState(3);
  assert.equal(initial.remainingPoints, 3);
  const opening = transitionMosaic(initial, { type: "openCell", cellIndex: 0 });
  const victory = transitionMosaic(opening.state, { type: "submitAnswer", correct: true });
  assert.equal(victory.outcome, "correct");
  assert.equal(victory.state.remainingPoints, 2);
  assert.equal(transitionMosaic(createMosaicState(1), { type: "openCell", cellIndex: 0 }).outcome, "exhausted");
  for (const invalid of [0, -1, 11, 2.5, NaN]) assert.throws(() => createMosaicState(invalid), /invalid-mosaic-budget/);
});

test("the last opening or wrong answer loses; zero budget cannot win", () => {
  for (const action of [{ type: "openCell", cellIndex: 2 } as const, { type: "submitAnswer", correct: false } as const]) {
    const last = transitionMosaic({ ...createMosaicState(), remainingPoints: 1 }, action);
    assert.equal(last.outcome, "exhausted");
    assert.equal(last.state.remainingPoints, 0);
    assert.equal(transitionMosaic(last.state, { type: "submitAnswer", correct: true }).outcome, "exhausted");
  }
  assert.equal(transitionMosaic(createMosaicState(), { type: "submitAnswer", correct: true }).state.remainingPoints, 10);
  assert.throws(() => transitionMosaic(createMosaicState(), { type: "openCell", cellIndex: 24 }));
});

test("mixed statistics distinguish openings from wrong guesses and use canonical points", () => {
  const statistics = calculateAuthorQuizStatistics([
    { type: "classic", attemptLimit: 3, attemptsRemaining: 3, outcome: "correct", awardedPoints: 3, durationSeconds: 20 },
    { type: "mosaic", attemptLimit: 10, attemptsRemaining: 5, wrongAnswers: 0, outcome: "correct", awardedPoints: 5, durationSeconds: 30 },
    { type: "mosaic", attemptLimit: 10, attemptsRemaining: 8, wrongAnswers: 1, outcome: "correct", awardedPoints: 8, durationSeconds: 40 },
    { type: "mosaic", attemptLimit: 10, attemptsRemaining: 0, wrongAnswers: 2, outcome: "exhausted", awardedPoints: 0, durationSeconds: 50 },
  ]);
  assert.equal(statistics.totalPoints, 16);
  assert.equal(statistics.firstTryCorrectCount, 2);
  assert.equal(statistics.bestCorrectStreak, 3);
  assert.equal(statistics.currentCorrectStreak, 0);
  assert.equal(calculateQuizPoints({ outcome: "correct", attemptsRemaining: 3 }), 3);
});
