"use client";

import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { AdminPlatform } from "@/db/queries/platforms";
import { AdminToasts, type AdminToast } from "../admin-toasts";

export function PlatformForm({ platform, action, errorMessage, updated }: {
  platform: AdminPlatform;
  action: (formData: FormData) => Promise<void>;
  errorMessage: string | null;
  updated: boolean;
}) {
  const messages = [
    ...(updated ? [{ id: "success", tone: "success" as const, text: "Платформа сохранена." }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];
  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <input type="hidden" name="platformId" value={platform.id} />
      <div className="grid gap-2">
        <Label htmlFor="platform-name">Название</Label>
        <Input id="platform-name" name="name" defaultValue={platform.name} required aria-describedby="platform-name-hint" />
        <p id="platform-name-hint" className="text-xs leading-5 text-stone-500">
          Название используется во всех карточках записей с этой платформой.
        </p>
      </div>
      <div><Button type="submit"><Save />Сохранить</Button></div>
    </form>
  );
}
