"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { loginAuthorInline, type AuthorLoginState } from "../login/actions";

const ERROR_MESSAGES = {
  invalid: "Не удалось войти. Проверь токен доступа.",
  "rate-limit": "Слишком много попыток входа. Попробуй позже.",
  "rate-limit-unavailable": "Вход временно недоступен. Попробуй позже.",
} as const;

export function AuthorTokenLoginForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    AuthorLoginState,
    FormData
  >(loginAuthorInline, null);

  useEffect(() => {
    if (!state?.ok) return;
    router.replace(state.onboarding ? "/author/profile" : "/author");
  }, [router, state]);

  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input
        className="sr-only"
        name="username"
        autoComplete="username"
        value="legacy-token"
        tabIndex={-1}
        aria-hidden="true"
        readOnly
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="author-access-token">Токен доступа</Label>
        <Input
          id="author-access-token"
          name="accessToken"
          type="password"
          autoComplete="off"
          required
          autoFocus
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Входим…" : "Войти по токену"}
      </Button>
      {error ? <Alert variant="destructive">{ERROR_MESSAGES[error]}</Alert> : null}
    </form>
  );
}
