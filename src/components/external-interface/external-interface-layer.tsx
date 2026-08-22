"use client";

import { Bug, Heart } from "lucide-react";
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
import { BugReportModal } from "@/components/bug-reports/bug-report-modal";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";

export type QuizParticipantHudState = QuizParticipantState;
export type BugReportEntityContext = {
  entityId: string;
  entityType: "franchise" | "media-item" | "quiz";
};

type ExternalInterfaceValue = {
  quizParticipant: QuizParticipantHudState | null;
  registerBugReportEntityContext: (context: BugReportEntityContext) => () => void;
  setQuizParticipant: (participant: QuizParticipantHudState | null) => void;
};

const ExternalInterfaceContext = createContext<ExternalInterfaceValue | null>(null);

export function ExternalInterfaceLayer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const [authenticated, setAuthenticated] = useState(false);
  const [bugReportContext, setBugReportContext] = useState<BugReportEntityContext | null>(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [quizParticipant, setQuizParticipantState] = useState<QuizParticipantHudState | null>(null);
  const bugReportContextsRef = useRef(new Map<number, BugReportEntityContext>());
  const nextBugReportContextIdRef = useRef(1);
  const requestGenerationRef = useRef(0);

  const registerBugReportEntityContext = useCallback((context: BugReportEntityContext) => {
    const registrationId = nextBugReportContextIdRef.current;
    nextBugReportContextIdRef.current += 1;
    bugReportContextsRef.current.set(registrationId, context);
    setBugReportContext(context);

    return () => {
      bugReportContextsRef.current.delete(registrationId);
      const remainingContexts = [...bugReportContextsRef.current.values()];
      setBugReportContext(remainingContexts.at(-1) ?? null);
    };
  }, []);

  const setQuizParticipant = useCallback((participant: QuizParticipantHudState | null) => {
    requestGenerationRef.current += 1;
    setQuizParticipantState(participant);
  }, []);

  const refreshQuizParticipant = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    if (isAdminRoute) {
      setAuthenticated(false);
      setQuizParticipantState(null);
      setIsBugReportOpen(false);
      return;
    }

    try {
      const response = await fetch("/api/user-hud", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = await response.json() as {
        authenticated?: boolean;
        quizParticipant?: QuizParticipantHudState | null;
      };
      if (requestGenerationRef.current === requestGeneration) {
        setAuthenticated(data.authenticated === true);
        setQuizParticipantState(data.quizParticipant ?? null);
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

  const value = useMemo(
    () => ({ quizParticipant, registerBugReportEntityContext, setQuizParticipant }),
    [quizParticipant, registerBugReportEntityContext, setQuizParticipant],
  );
  const visibleParticipant = quizParticipant && !quizParticipant.completed
    ? quizParticipant
    : null;

  return (
    <ExternalInterfaceContext.Provider value={value}>
      {children}
      {authenticated && !isAdminRoute ? (
        <aside
          className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 sm:bottom-auto sm:top-[max(0.75rem,env(safe-area-inset-top))]"
          aria-label="Пользовательские инструменты"
        >
          {visibleParticipant ? (
            <div
              className="archive-paper-surface pointer-events-auto flex items-center gap-1 rounded-full border border-red-900/25 bg-stone-50/90 px-3 py-2 shadow-[0_10px_24px_rgba(28,25,23,0.2)] backdrop-blur-sm"
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
          ) : null}
          <ArchiveTooltip align="end" label="Сообщить об ошибке" portal side="bottom">
            <button
              type="button"
              className="archive-paper-surface pointer-events-auto grid size-10 place-items-center rounded-full border border-stone-900/20 bg-stone-50/90 text-stone-700 shadow-[0_10px_24px_rgba(28,25,23,0.2)] backdrop-blur-sm transition-colors hover:border-red-900/40 hover:text-red-900"
              aria-label="Сообщить об ошибке"
              onClick={() => setIsBugReportOpen(true)}
            >
              <Bug className="size-5" />
            </button>
          </ArchiveTooltip>
        </aside>
      ) : null}
      {isBugReportOpen ? (
        <BugReportModal entityContext={bugReportContext} onClose={() => setIsBugReportOpen(false)} />
      ) : null}
    </ExternalInterfaceContext.Provider>
  );
}

export function useExternalInterface() {
  const value = useContext(ExternalInterfaceContext);
  if (!value) throw new Error("useExternalInterface must be used inside ExternalInterfaceLayer");
  return value;
}
