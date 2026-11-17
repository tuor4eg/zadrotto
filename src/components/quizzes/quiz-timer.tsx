"use client";

import { useEffect, useState } from "react";
import { formatQuizTimeRemaining } from "@/lib/quizzes/model";

export function QuizTimer({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [endsAt]);
  return <span className="media-carrier-font-pc-steam shrink-0 text-xs lowercase text-stone-600">
    {now ? now.getTime() >= new Date(endsAt).getTime() ? "Квиз завершён" : formatQuizTimeRemaining(endsAt, now) : "Осталось …"}
  </span>;
}
