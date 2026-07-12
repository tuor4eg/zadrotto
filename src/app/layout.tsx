import type { Metadata, Viewport } from "next";

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
