"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { loginAuthorInline, type AuthorLoginState } from "./actions";

const ERROR_MESSAGES = {
  invalid: "Неверный токен доступа.",
  "rate-limit": "Слишком много попыток входа. Попробуй позже.",
  "rate-limit-unavailable": "Вход временно недоступен. Попробуй позже.",
} as const;

type AuthorLoginFormProps = {
  initialError?: Exclude<AuthorLoginState, null | { ok: true }>["error"] | null;
  onSuccess?: () => void;
  redirectOnSuccess?: boolean;
};

export function AuthorLoginForm({ initialError = null, onSuccess, redirectOnSuccess = false }: AuthorLoginFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAuthorInline, null);

  useEffect(() => {
    if (!state?.ok) return;
    if (redirectOnSuccess) router.replace("/author");
    else onSuccess?.();
  }, [onSuccess, redirectOnSuccess, router, state]);

  const error = state && !state.ok ? state.error : initialError;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="author-access-token">Токен доступа</Label>
        <Input id="author-access-token" name="accessToken" type="password" autoComplete="off" required autoFocus />
      </div>
      {error ? <Alert variant="destructive">{ERROR_MESSAGES[error]}</Alert> : null}
      <Button type="submit" disabled={isPending}>{isPending ? "Входим…" : "Войти"}</Button>
    </form>
  );
}
