import { Trophy } from "lucide-react";

import type { QuizParticipantState } from "@/lib/quizzes/model";

export function QuizResult({ participant }: { participant: QuizParticipantState }) {
  const correct = participant.outcome === "correct";

  return (
    <div className="media-carrier-font-pc-steam flex h-[90px] w-full shrink-0 items-center gap-4 rounded-md border border-amber-800/25 bg-amber-700/5 px-4 py-3 text-left sm:gap-6 sm:px-6">
      <div aria-hidden="true" className="relative grid h-16 w-24 shrink-0 place-items-center sm:w-32">
        <svg viewBox="0 0 128 72" className="absolute inset-0 h-full w-full fill-amber-700/35" focusable="false">
          {[false, true].map((mirrored) => (
            <g key={String(mirrored)} transform={mirrored ? "translate(128 0) scale(-1 1)" : undefined}>
              <path d="M30 8C12 27 14 51 36 65" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-700/35" />
              <ellipse cx="26" cy="13" rx="3" ry="7" transform="rotate(30 26 13)" />
              <ellipse cx="18" cy="24" rx="3" ry="7" transform="rotate(-20 18 24)" />
              <ellipse cx="24" cy="29" rx="3" ry="7" transform="rotate(40 24 29)" />
              <ellipse cx="17" cy="38" rx="3" ry="7" transform="rotate(-35 17 38)" />
              <ellipse cx="25" cy="42" rx="3" ry="7" transform="rotate(35 25 42)" />
              <ellipse cx="22" cy="52" rx="3" ry="7" transform="rotate(-45 22 52)" />
              <ellipse cx="32" cy="55" rx="3" ry="7" transform="rotate(20 32 55)" />
              <ellipse cx="31" cy="63" rx="3" ry="7" transform="rotate(-60 31 63)" />
            </g>
          ))}
        </svg>
        <Trophy className="relative size-10 text-amber-700 sm:size-12" strokeWidth={1.7} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-950/55">Ваш результат</p>
        <p className="mt-0.5 truncate text-lg leading-tight text-stone-950 sm:text-2xl">
          {correct ? "Вы ответили правильно!" : "Вы исчерпали попытки"}
        </p>
        <p className="mt-1 truncate text-sm leading-snug text-stone-800 sm:text-lg">
          {correct ? `Очков: ${participant.points}` : "Повезёт в следующий раз"}
        </p>
      </div>
    </div>
  );
}
