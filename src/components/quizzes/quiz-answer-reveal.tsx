"use client";

import { CircleCheck, CircleHelp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { getRevealedQuizAnswer } from "@/db/queries/quizzes";
import { formatQuizTimeRemaining } from "@/lib/quizzes/model";

export function QuizAnswerReveal({ quizId, endsAt, solved }: {
  quizId: number;
  endsAt: string;
  solved: boolean;
}) {
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof getRevealedQuizAnswer>>>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let requestedAfterEnd = Date.now() >= new Date(endsAt).getTime();
    async function load() {
      try {
        const response = await fetch(`/api/quizzes/${quizId}/answer`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("answer-unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setAnswer(data.answer);
          setLoaded(true);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    const interval = window.setInterval(() => {
      const currentTime = new Date();
      setNow(currentTime);
      if (!requestedAfterEnd && currentTime.getTime() >= new Date(endsAt).getTime()) {
        requestedAfterEnd = true;
        void load();
      }
    }, 1_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [quizId, endsAt, solved]);

  const revealed = answer !== null;
  const Icon = revealed ? CircleCheck : CircleHelp;
  const expired = now !== null && now.getTime() >= new Date(endsAt).getTime();

  return (
    <div className="media-carrier-font-pc-steam relative isolate flex h-[90px] w-full shrink-0 items-center gap-4 overflow-hidden rounded-md border border-emerald-950/20 bg-emerald-900/5 px-4 py-3 text-left sm:gap-6 sm:px-6">
      {answer?.coverUrl ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-25" style={{ maskImage: "linear-gradient(to right, transparent 20%, black 100%)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={answer.coverUrl} alt="" className="h-full w-full object-cover object-center" />
        </div>
      ) : null}
      <Icon aria-hidden="true" className="size-10 shrink-0 text-emerald-950/80 sm:size-12" strokeWidth={1.7} />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-950/70">Правильный ответ{revealed ? ":" : ""}</p>
        {answer ? (
          <>
            <Link href={`/media/${answer.code}`} className="mt-0.5 block truncate text-lg leading-tight text-stone-950 hover:underline sm:text-2xl">{answer.title}</Link>
            {answer.comment ? <p className="mt-1 truncate text-sm leading-snug text-stone-600 sm:text-base">{answer.comment}</p> : null}
          </>
        ) : (
          <p className="mt-1 line-clamp-2 text-base leading-snug text-stone-800 sm:text-xl">
            {error ? "Не удалось загрузить ответ" : solved || expired ? loaded ? "Ответ недоступен" : "Загружаем ответ…" : `Ответ появится через ${now ? formatQuizTimeRemaining(endsAt, now).replace(/^Осталось /, "") : "…"}`}
          </p>
        )}
      </div>
    </div>
  );
}
