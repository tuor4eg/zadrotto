"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";

const POLL_INTERVAL_MS = 30_000;

type PendingAchievementResponse = {
  authenticated: boolean;
  group?: {
    awardGroupId: string;
    count: number;
    name: string | null;
  } | null;
};

export function AchievementToastHost() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const [messages, setMessages] = useState<ArchiveToast[]>([]);
  const authenticatedRef = useRef<boolean | null>(null);
  const requestPendingRef = useRef(false);

  const checkPendingAchievements = useCallback(async () => {
    if (isAdminRoute || requestPendingRef.current || document.visibilityState !== "visible") {
      return;
    }

    requestPendingRef.current = true;

    try {
      const response = await fetch("/api/achievements/pending", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json()) as PendingAchievementResponse;

      authenticatedRef.current = data.authenticated;

      if (data.group) {
        setMessages([{
          id: `achievement-${data.group.awardGroupId}`,
          link: { href: "/author/achievements", label: "Ачивки" },
          tone: "success",
          text: data.group.count === 1 && data.group.name
            ? `Получена ачивка «${data.group.name}».`
            : `Получены новые ачивки: ${data.group.count}.`,
        }]);
      }
    } catch {
      // Следующая проверка восстановит доставку; сама ачивка хранится в профиле.
    } finally {
      requestPendingRef.current = false;
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) return;

    const timeoutId = window.setTimeout(() => void checkPendingAchievements(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkPendingAchievements, isAdminRoute, pathname]);

  useEffect(() => {
    if (isAdminRoute) return;

    const intervalId = window.setInterval(() => {
      if (authenticatedRef.current) {
        void checkPendingAchievements();
      }
    }, POLL_INTERVAL_MS);
    const onFocus = () => void checkPendingAchievements();

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkPendingAchievements, isAdminRoute]);

  return <ArchiveToasts messages={messages} />;
}
