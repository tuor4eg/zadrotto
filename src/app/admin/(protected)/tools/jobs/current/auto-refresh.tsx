"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CurrentJobsAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => { if (!document.hidden) startTransition(() => router.refresh()); };
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  return <div className="flex flex-wrap items-center gap-3 text-sm text-stone-500">
    <span>Обновляется каждые 5 секунд, пока страница открыта.</span>
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Обновляем…" : "Обновить"}</Button>
  </div>;
}
