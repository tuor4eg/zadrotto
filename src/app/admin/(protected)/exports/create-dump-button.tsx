"use client";

import { Database } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function CreateDumpButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Database />{pending ? "Постановка в очередь…" : "Создать дамп базы"}</Button>;
}
