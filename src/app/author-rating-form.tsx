"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { saveAuthorRatingAction, type SaveAuthorRatingState } from "@/app/ratings/actions";

type AuthorRatingFormProps = {
  mediaItemCode: string;
  franchiseCode?: string | null;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorScore: number | null;
  compact?: boolean;
};

const initialState: SaveAuthorRatingState = {
  error: null,
};

const RATING_BUTTON_SCORES = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);

export function AuthorRatingForm({
  mediaItemCode,
  franchiseCode,
  currentAuthor,
  currentAuthorScore,
  compact = false,
}: AuthorRatingFormProps) {
  const [state, formAction, isPending] = useActionState(saveAuthorRatingAction, initialState);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const visibleSelectedScore =
    selectedScore ?? (currentAuthorScore !== null && currentAuthorScore % 10 === 0
      ? currentAuthorScore
      : null);
  const hasUnsavedScore = selectedScore !== null && selectedScore !== currentAuthorScore;
  const hasSavedScore = currentAuthorScore !== null;

  if (!currentAuthor) {
    return (
      <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
        <Link
          href="/author/login"
          className="font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-950"
        >
          Войти как автор
        </Link>
        , чтобы поставить оценку.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className={`relative border border-zinc-200 ${compact ? "p-2" : "p-3"}`}
    >
      <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
      {franchiseCode ? <input type="hidden" name="franchiseCode" value={franchiseCode} /> : null}
      {selectedScore !== null ? (
        <input type="hidden" name="score" value={selectedScore / 10} />
      ) : null}

      {hasSavedScore ? (
        <button
          type="submit"
          name="intent"
          value="delete"
          disabled={isPending}
          title="Удалить мою оценку"
          aria-label="Удалить мою оценку"
          onClick={() => setSelectedScore(null)}
          className={`absolute right-3 top-3 flex items-center justify-center border border-zinc-200 bg-white font-semibold leading-none text-zinc-400 transition-colors hover:border-red-300 hover:text-red-700 disabled:bg-zinc-100 disabled:text-zinc-300 ${
            compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"
          }`}
        >
          Х
        </button>
      ) : null}

      <div className={`flex flex-col ${hasSavedScore ? "gap-5" : "gap-3"}`}>
        <div className={hasSavedScore ? "pr-10" : undefined}>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Моя оценка
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`grid min-w-0 flex-1 grid-cols-10 ${
              compact ? "gap-px" : "gap-1"
            }`}
            aria-label="Оценка"
          >
            {RATING_BUTTON_SCORES.map((score) => {
              const isSelected = visibleSelectedScore === score;

              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => setSelectedScore(score)}
                  disabled={isPending}
                  className={`border font-semibold tabular-nums transition-colors disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${
                    compact ? "h-7 text-[11px]" : "h-9 text-sm"
                  } ${
                    isSelected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
                  }`}
                >
                  {score / 10}
                </button>
              );
            })}
          </div>

          {hasUnsavedScore ? (
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={isPending}
              title="Сохранить оценку"
              aria-label="Сохранить оценку"
              className={`flex items-center justify-center border border-zinc-950 bg-zinc-950 font-semibold leading-none text-white transition-colors hover:bg-white hover:text-zinc-950 disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400 ${
                compact ? "h-7 w-7 text-sm" : "h-9 w-9 text-base"
              }`}
            >
              {isPending ? "..." : "✓"}
            </button>
          ) : null}
        </div>

        {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
      </div>
    </form>
  );
}
