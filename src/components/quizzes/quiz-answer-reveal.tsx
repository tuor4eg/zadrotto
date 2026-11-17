"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { getRevealedQuizAnswer } from "@/db/queries/quizzes";

export function QuizAnswerReveal({ quizId, endsAt, solved }: {
  quizId: number;
  endsAt: string;
  solved: boolean;
}) {
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof getRevealedQuizAnswer>>>(null);

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
        }
      } catch {
        // Keep the answer hidden when it is unavailable.
      }
    }
    void load();
    const interval = window.setInterval(() => {
      const currentTime = new Date();
      if (!requestedAfterEnd && currentTime.getTime() >= new Date(endsAt).getTime()) {
        requestedAfterEnd = true;
        void load();
      }
    }, 1_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [quizId, endsAt, solved]);

  if (!answer) return null;

  return (
    <div className="media-carrier-font-pc-steam relative isolate flex min-h-[90px] min-w-0 w-full shrink-0 items-center gap-4 overflow-hidden rounded-md border border-emerald-950/20 bg-emerald-900/5 px-4 py-3 text-left sm:gap-6 sm:px-6">
      {answer?.coverUrl ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-25" style={{ maskImage: "linear-gradient(to right, transparent 20%, black 100%)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={answer.coverUrl} alt="" className="h-full w-full object-cover object-center" />
        </div>
      ) : null}
      <CircleCheck aria-hidden="true" className="size-10 shrink-0 text-emerald-950/80 sm:size-12" strokeWidth={1.7} />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-950/70">Правильный ответ:</p>
        <Link href={`/media/${answer.code}`} className="mt-0.5 block break-words text-lg leading-tight text-stone-950 hover:underline sm:text-2xl">{answer.title}</Link>
        {answer.comment ? <p className="mt-1 break-words text-sm leading-snug text-stone-600 sm:text-base">{answer.comment}</p> : null}
      </div>
    </div>
  );
}
