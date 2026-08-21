"use client";

import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { QuizParticipantState } from "@/lib/quizzes/model";

export type QuizParticipantHudState = QuizParticipantState;

type ExternalInterfaceValue = {
  setQuizParticipant: (participant: QuizParticipantHudState | null) => void;
};

const ExternalInterfaceContext = createContext<ExternalInterfaceValue | null>(null);

export function ExternalInterfaceLayer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const [quizParticipant, setQuizParticipantState] = useState<QuizParticipantHudState | null>(null);
  const requestGenerationRef = useRef(0);

  const setQuizParticipant = useCallback((participant: QuizParticipantHudState | null) => {
    requestGenerationRef.current += 1;
    setQuizParticipantState(participant);
  }, []);

  const refreshQuizParticipant = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    if (isAdminRoute) {
      setQuizParticipantState(null);
      return;
    }

    try {
      const response = await fetch("/api/quizzes/active/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = await response.json() as { participant?: QuizParticipantHudState | null };
      if (requestGenerationRef.current === requestGeneration) {
        setQuizParticipantState(data.participant ?? null);
      }
    } catch {
      // Навигация или возврат фокуса повторят синхронизацию с сервером.
    }
  }, [isAdminRoute]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refreshQuizParticipant(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [pathname, refreshQuizParticipant]);

  useEffect(() => {
    if (isAdminRoute) return;
    const onFocus = () => void refreshQuizParticipant();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isAdminRoute, refreshQuizParticipant]);

  const value = useMemo(() => ({ setQuizParticipant }), [setQuizParticipant]);
  const visibleParticipant = quizParticipant && !quizParticipant.completed
    ? quizParticipant
    : null;

  return (
    <ExternalInterfaceContext.Provider value={value}>
      {children}
      {visibleParticipant ? (
        <aside
          className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[70] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-auto sm:top-[max(0.75rem,env(safe-area-inset-top))]"
          aria-label="Игровые показатели"
        >
          <div
            className="archive-paper-surface flex items-center gap-1 rounded-full border border-red-900/25 bg-stone-50/90 px-3 py-2 shadow-[0_10px_24px_rgba(28,25,23,0.2)] backdrop-blur-sm"
            role="status"
            aria-label={`Осталось попыток: ${visibleParticipant.attemptsRemaining} из ${visibleParticipant.attemptLimit}`}
          >
            {Array.from({ length: visibleParticipant.attemptLimit }, (_, index) => {
              const available = index < visibleParticipant.attemptsRemaining;
              return (
                <Heart
                  key={index}
                  aria-hidden="true"
                  className={available
                    ? "size-5 fill-red-700 text-red-800 drop-shadow-sm"
                    : "size-5 fill-stone-200 text-stone-400"
                  }
                />
              );
            })}
          </div>
        </aside>
      ) : null}
    </ExternalInterfaceContext.Provider>
  );
}

export function useExternalInterface() {
  const value = useContext(ExternalInterfaceContext);
  if (!value) throw new Error("useExternalInterface must be used inside ExternalInterfaceLayer");
  return value;
}
