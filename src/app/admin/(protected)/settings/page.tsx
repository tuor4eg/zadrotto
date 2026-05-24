import { ShieldCheck } from "lucide-react";

import { PageHeader } from "../admin-ui";
import { ChangeAdminPasswordForm } from "./change-admin-password-form";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Настройки"
        description="Параметры админского доступа."
      />

      <div className="mt-5 grid gap-5 border-t border-stone-100 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h3 className="font-medium text-stone-950">Пароль администратора</h3>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              После смены пароля остальные админские сессии потребуют повторного входа.
            </p>
          </div>
        </div>

        <ChangeAdminPasswordForm />
      </div>
    </div>
  );
}
