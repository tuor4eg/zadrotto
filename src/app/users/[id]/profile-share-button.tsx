"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";

export function ProfileShareButton({ profileId, name }: { profileId: number; name: string }) {
  const [status, setStatus] = useState("");
  async function share() {
    const url = new URL(`/users/${profileId}`, window.location.origin).href;
    try {
      if (window.matchMedia("(pointer: coarse)").matches && navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("Ссылка скопирована");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("Не удалось поделиться ссылкой");
    }
  }
  return <>
    <ArchiveTooltip label={status || "Поделиться"} portal>
      <Button type="button" variant="outline" size="icon" aria-label="Поделиться профилем" onClick={share}>
        {status === "Ссылка скопирована" ? <Check /> : <Share2 />}
      </Button>
    </ArchiveTooltip>
    <span role="status" className="sr-only">{status}</span>
  </>;
}
