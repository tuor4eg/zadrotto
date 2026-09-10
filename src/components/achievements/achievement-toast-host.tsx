"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { usePageUnavailable } from "@/components/external-interface/page-availability";
import { ARCHIVE_ONBOARDING_RATING_SAVED_EVENT } from "@/lib/onboarding/model";
import {
  claimNewlyEarnedDemoAchievements,
  type DemoAchievementCatalogItem,
} from "@/lib/user-state/demo-achievements";
import {
  readDemoAchievementToastState,
  writeDemoAchievementToastState,
} from "@/lib/user-state/demo-achievement-toasts";
import { DEMO_PROFILE_STORAGE_EVENT } from "@/lib/user-state/demo-profile";
import { hasActiveDemoProfile, readDemoProfile } from "@/lib/user-state/demo-storage";

const POLL_INTERVAL_MS = 30_000;

type PendingAchievementResponse = {
  authenticated: boolean;
  group?: {
    awardGroupId: string;
    achievements: Array<{
      id: number;
      imageUrl: string | null;
      name: string;
    }>;
  } | null;
};

type DemoAchievementStateResponse = {
  achievements: DemoAchievementCatalogItem[]
  values: Record<string, number>
}

async function loadDemoAchievementState(mediaItemCodes: string[]): Promise<DemoAchievementStateResponse> {
  const response = await fetch("/api/demo-achievements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaItemCodes }),
    cache: "no-store",
  })
  if (!response.ok) return { achievements: [], values: {} }
  const data = await response.json() as {
    achievements?: DemoAchievementCatalogItem[]
    values?: Record<string, number>
  }
  return {
    achievements: data.achievements ?? [],
    values: data.values ?? {},
  }
}

export function AchievementToastHost() {
  const pathname = usePathname();
  const pageUnavailable = usePageUnavailable();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const [messages, setMessages] = useState<ArchiveToast[]>([]);
  const authenticatedRef = useRef<boolean | null>(null);
  const requestPendingRef = useRef(false);
  const demoCheckPendingRef = useRef(false);

  const checkPendingAchievements = useCallback(async () => {
    if (pageUnavailable || isAdminRoute || requestPendingRef.current || document.visibilityState !== "visible") {
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
        const group = data.group;
        setMessages(group.achievements.map((achievement) => ({
          id: `achievement-${group.awardGroupId}-${achievement.id}`,
          imageUrl: achievement.imageUrl,
          imageFit: "contain",
          link: {
            fullToast: true,
            href: "/achievements",
            label: `Открыть ачивку «${achievement.name}»`,
          },
          tone: "success",
          text: `Получена ачивка «${achievement.name}».`,
        })));
      }
    } catch {
      // Следующая проверка восстановит доставку; сама ачивка хранится в профиле.
    } finally {
      requestPendingRef.current = false;
    }
  }, [isAdminRoute, pageUnavailable]);

  const checkDemoAchievements = useCallback(async () => {
    if (
      pageUnavailable
      || isAdminRoute
      || demoCheckPendingRef.current
      || document.visibilityState !== "visible"
      || !hasActiveDemoProfile()
    ) {
      return
    }

    demoCheckPendingRef.current = true
    try {
      const profile = readDemoProfile()
      if (!profile || profile.import.importedAt != null) return

      const { achievements, values } = await loadDemoAchievementState(Object.keys(profile.ratings))
      if (achievements.length === 0) return

      const toastState = readDemoAchievementToastState()
      const claim = claimNewlyEarnedDemoAchievements({
        announcedKeys: toastState.announcedKeys,
        catalog: achievements,
        seeded: toastState.seeded,
        valuesByCode: values,
      })

      writeDemoAchievementToastState({
        announcedKeys: claim.announcedKeys,
        seeded: claim.seeded,
      })

      if (claim.newlyEarned.length === 0) return

      const groupId = `demo-${Date.now()}`
      setMessages(claim.newlyEarned.map((achievement) => ({
        id: `achievement-${groupId}-${achievement.key}`,
        imageUrl: achievement.imageUrl,
        imageFit: "contain",
        link: {
          fullToast: true,
          href: "/achievements",
          label: `Открыть ачивку «${achievement.name}»`,
        },
        tone: "success",
        text: `Получена ачивка «${achievement.name}».`,
      })))
    } catch {
      // Next rating save or focus check retries announcement.
    } finally {
      demoCheckPendingRef.current = false
    }
  }, [isAdminRoute, pageUnavailable])

  useEffect(() => {
    if (isAdminRoute) return;

    const timeoutId = window.setTimeout(() => {
      void checkPendingAchievements()
      void checkDemoAchievements()
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkDemoAchievements, checkPendingAchievements, isAdminRoute, pathname]);

  useEffect(() => {
    if (isAdminRoute) return;

    const intervalId = window.setInterval(() => {
      if (authenticatedRef.current) {
        void checkPendingAchievements();
      }
      if (hasActiveDemoProfile()) {
        void checkDemoAchievements()
      }
    }, POLL_INTERVAL_MS);
    const onFocus = () => {
      void checkPendingAchievements()
      void checkDemoAchievements()
    }
    const onDemoChange = () => {
      void checkDemoAchievements()
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener(DEMO_PROFILE_STORAGE_EVENT, onDemoChange)
    window.addEventListener(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, onDemoChange)

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(DEMO_PROFILE_STORAGE_EVENT, onDemoChange)
      window.removeEventListener(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, onDemoChange)
    };
  }, [checkDemoAchievements, checkPendingAchievements, isAdminRoute]);

  return pageUnavailable ? null : <ArchiveToasts messages={messages} />;
}
