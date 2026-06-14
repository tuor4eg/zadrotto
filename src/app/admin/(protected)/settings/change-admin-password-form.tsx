"use client";

import { Save } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import {
  changeAdminPasswordAction,
  type ChangeAdminPasswordState,
} from "./actions";

const initialState: ChangeAdminPasswordState = {
  error: null,
  success: null,
};

export function ChangeAdminPasswordForm({ adminLogin }: { adminLogin: string }) {
  const [state, formAction, isPending] = useActionState(
    changeAdminPasswordAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const toastMessages = [
    ...(state.success ? [{ id: "success", tone: "success" as const, text: state.success }] : []),
    ...(state.error ? [{ id: "error", tone: "error" as const, text: state.error }] : []),
  ] satisfies AdminToast[];

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-5" autoComplete="off" noValidate>
      <AdminToasts messages={toastMessages} />
      <input
        type="hidden"
        name="username"
        value={adminLogin}
        autoComplete="username"
        readOnly
      />

      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-current-password">Текущий пароль</Label>
          <Input
            id="admin-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-new-password">Новый пароль</Label>
          <Input
            id="admin-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-new-password-confirmation">Повтор нового пароля</Label>
          <Input
            id="admin-new-password-confirmation"
            name="newPasswordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          <Save />
          {isPending ? "Сохраняем" : "Сменить пароль"}
        </Button>
      </div>
    </form>
  );
}
