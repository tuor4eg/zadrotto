"use client";

import { usePathname } from "next/navigation";

import { usePageUnavailable } from "@/components/external-interface/page-availability";
import { ArchiveSiteFooter } from "@/components/archive/archive-site-footer";

function usesPublicSiteShell(pathname: string) {
  return ![
    "/admin",
    "/author",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function PublicSiteFooterLayer() {
  const pathname = usePathname();
  const pageUnavailable = usePageUnavailable();

  if (pageUnavailable || !usesPublicSiteShell(pathname)) return null;

  return (
    <div className="public-site-footer-layer shrink-0 bg-[var(--archive-bg-end)] px-3 pb-3 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto w-full max-w-[1480px]">
        <ArchiveSiteFooter />
      </div>
    </div>
  );
}
