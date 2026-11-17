/** Version 1 is immutable: Mulberry32, Fisher–Yates, then 24 quarter-turns. */
export const MOSAIC_VERSION = 1;
export const MOSAIC_COLUMNS = 4;
export const MOSAIC_ROWS = 6;
export const MOSAIC_CELLS = MOSAIC_COLUMNS * MOSAIC_ROWS;
export const MOSAIC_BUDGET = 10;

export type MosaicState = {
  version: 1;
  remainingPoints: number;
  openedMask: number;
  wrongAnswers: number;
  processedActions: string[];
};
export type MosaicAction = { type: "openCell"; cellIndex: number } | { type: "submitAnswer"; titleId: number };
export type MosaicCommand = MosaicAction & { actionId: string; revision: number };

export function isMosaicSeed(seed: unknown): seed is number {
  return typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff;
}

export function createMosaicState(budget = MOSAIC_BUDGET): MosaicState {
  if (!Number.isInteger(budget) || budget < 1 || budget > 10) throw new Error("invalid-mosaic-budget");
  return { version: 1, remainingPoints: budget, openedMask: 0, wrongAnswers: 0, processedActions: [] };
}

export function createMosaicLayout(seed: number) {
  if (!isMosaicSeed(seed)) throw new Error("invalid-mosaic-seed");
  let value = seed;
  function random() {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  }
  const indices = Array.from({ length: MOSAIC_CELLS }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [indices[index], indices[target]] = [indices[target], indices[index]];
  }
  return indices.map((sourceIndex) => ({ sourceIndex, rotation: Math.floor(random() * 4) * 90 }));
}

export function getMosaicCrop(width: number, height: number) {
  if (width <= 0 || height <= 0) throw new Error("invalid-image-size");
  const cropWidth = Math.min(width, height * 2 / 3);
  const cropHeight = cropWidth * 3 / 2;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

export function isMosaicCellOpen(mask: number, index: number) {
  return (mask & (1 << index)) !== 0;
}

export function transitionMosaic(state: MosaicState, action: { type: "openCell"; cellIndex: number } | { type: "submitAnswer"; correct: boolean }) {
  if (state.remainingPoints <= 0) return { state, outcome: "exhausted" as const, changed: false };
  if (action.type === "submitAnswer" && action.correct) {
    return { state, outcome: "correct" as const, changed: true, correct: true };
  }
  if (action.type === "openCell") {
    if (!Number.isInteger(action.cellIndex) || action.cellIndex < 0 || action.cellIndex >= MOSAIC_CELLS) throw new Error("invalid-cell");
    if (isMosaicCellOpen(state.openedMask, action.cellIndex)) return { state, outcome: null, changed: false };
  }
  const next = {
    ...state,
    remainingPoints: state.remainingPoints - 1,
    openedMask: action.type === "openCell" ? state.openedMask | (1 << action.cellIndex) : state.openedMask,
    wrongAnswers: state.wrongAnswers + (action.type === "submitAnswer" ? 1 : 0),
  };
  return { state: next, outcome: next.remainingPoints === 0 ? "exhausted" as const : null, changed: true, correct: false };
}
