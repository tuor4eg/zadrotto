"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SnapshotJobProgress({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  if (!active) return null;
  return <div className="flex flex-wrap items-center gap-3 text-sm">
    <p>Проверяем результат каждые 5 секунд. Можно оставаться на этой странице.</p>
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>Обновить статус</Button>
  </div>;
}
