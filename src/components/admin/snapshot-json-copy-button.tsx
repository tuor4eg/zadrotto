"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SnapshotJsonCopyButton({ codeId }: { codeId: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      const text = document.getElementById(codeId)?.textContent;
      if (text === undefined || text === null) throw new Error("JSON_NOT_FOUND");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch { setStatus("error"); }
  }
  return <div className="flex items-center gap-2">
    {status === "error" && <span role="status" className="text-xs text-red-700">Не удалось скопировать. Выделите текст вручную.</span>}
    <Button variant="outline" size="sm" onClick={() => void copy()} aria-live="polite">
      {status === "copied" ? <Check /> : <Copy />}{status === "copied" ? "Скопировано" : "Копировать JSON"}
    </Button>
  </div>;
}
