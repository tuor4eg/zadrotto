import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { RouteTransitionProgress } from "@/components/ui/route-transition-progress";
import { AchievementToastHost } from "@/components/achievements/achievement-toast-host";
import { NotificationInboxProvider } from "@/components/notifications/notification-inbox";
import { getSiteOrigin } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: "Журнал, которого не было",
  description: "Архив культурных записей и оценок.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NotificationInboxProvider>
          {children}
          <Suspense fallback={null}>
            <AchievementToastHost />
          </Suspense>
          <Suspense fallback={null}>
            <RouteTransitionProgress />
          </Suspense>
        </NotificationInboxProvider>
      </body>
    </html>
  );
}
