import "server-only";

import { performMosaicQuizAction } from "@/db/queries/quizzes";
import { MOSAIC_CELLS, type MosaicCommand } from "./mosaic";

function parseMosaicCommand(value: Record<string, unknown>): MosaicCommand | null {
  if (typeof value.actionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.actionId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return null;
  if (value.type === "openCell" && Number.isInteger(value.cellIndex) && Number(value.cellIndex) >= 0 && Number(value.cellIndex) < MOSAIC_CELLS) return value as MosaicCommand;
  if (value.type === "submitAnswer" && Number.isSafeInteger(value.titleId) && Number(value.titleId) > 0 && Number(value.titleId) <= 2_147_483_647) return value as MosaicCommand;
  return null;
}

/** Classic keeps its existing adapter; new interactive mechanics register their own command parser/service here. */
export const QUIZ_ACTION_HANDLERS = {
  mosaic: {
    async execute(quizId: number, authorId: number, value: Record<string, unknown>) {
      const command = parseMosaicCommand(value);
      return command ? performMosaicQuizAction(quizId, authorId, command) : { kind: "invalid-action" as const };
    },
  },
};

export function getQuizActionHandler(mechanic: unknown) {
  return typeof mechanic === "string" && Object.hasOwn(QUIZ_ACTION_HANDLERS, mechanic)
    ? QUIZ_ACTION_HANDLERS[mechanic as keyof typeof QUIZ_ACTION_HANDLERS] : null;
}
