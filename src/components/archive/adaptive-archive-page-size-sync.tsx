"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { getArchiveCatalogPageSize } from "@/lib/archive/tile-grid-capacity";

type AdaptiveArchivePageSizeSyncProps = {
  pageSize: number;
};

export function AdaptiveArchivePageSizeSync({ pageSize }: AdaptiveArchivePageSizeSyncProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const syncPageSize = () => {
      const nextPageSize = getArchiveCatalogPageSize(window.innerWidth);

      if (nextPageSize === pageSize) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("pageSize", String(nextPageSize));
      params.delete("page");

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    syncPageSize();
    window.addEventListener("resize", syncPageSize);

    return () => window.removeEventListener("resize", syncPageSize);
  }, [pageSize, pathname, router, searchParams]);

  return null;
}
