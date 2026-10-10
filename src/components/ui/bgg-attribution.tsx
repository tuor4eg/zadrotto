import Image from "next/image";

import { cn } from "@/lib/common/utils";

export function BggAttribution({ className }: { className?: string }) {
  return (
    <a
      href="https://boardgamegeek.com/"
      target="_blank"
      rel="noreferrer"
      aria-label="Данные BoardGameGeek — Powered by BGG"
      className={cn("inline-flex w-fit max-w-full", className)}
    >
      <Image
        src="/providers/bgg/powered-by-bgg.png"
        alt="Powered by BGG — BoardGameGeek"
        width={1472}
        height={432}
        className="h-auto w-36 max-w-full"
      />
    </a>
  );
}
