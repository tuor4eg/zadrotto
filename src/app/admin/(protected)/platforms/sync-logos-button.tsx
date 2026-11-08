"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SyncLogosButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending}>{pending ? "Постановка в очередь…" : "Обновить логотипы всех платформ"}</Button>;
}
