"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
  loginAuthorInline,
  loginAuthorWithPasswordInline,
  type AuthorLoginState,
} from "./actions";

const ERROR_MESSAGES = {
  invalid: "Не удалось войти. Проверь введённые данные.",
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
  const [passwordState, passwordFormAction, isPasswordPending] = useActionState(
    loginAuthorWithPasswordInline,
    null,
  );
  const [tokenState, tokenFormAction, isTokenPending] = useActionState(loginAuthorInline, null);
  const state = passwordState ?? tokenState;

  useEffect(() => {
    if (!state?.ok) return;
    if (redirectOnSuccess || state.onboarding) {
      router.replace(state.onboarding ? "/author/onboarding" : "/author");
    }
    else onSuccess?.();
  }, [onSuccess, redirectOnSuccess, router, state]);

  const error = state && !state.ok ? state.error : initialError;

  return (
    <div className="flex flex-col gap-5">
      <form action={passwordFormAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-login-identity">Логин или email</Label>
          <Input id="author-login-identity" name="identity" autoComplete="username" required autoFocus />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-login-password">Пароль</Label>
          <Input id="author-login-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" disabled={isPasswordPending}>
          {isPasswordPending ? "Входим…" : "Войти"}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link
            className="text-stone-700 underline underline-offset-4 hover:text-stone-950"
            href="/author/register"
          >
            Зарегистрироваться
          </Link>
          <Link
            className="text-stone-500 underline underline-offset-4 hover:text-stone-950"
            href="/author/forgot-password"
          >
            Восстановить пароль
          </Link>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span className="h-px flex-1 bg-stone-200" />
        <span>или по старому токену</span>
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <form action={tokenFormAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-access-token">Токен доступа</Label>
          <Input id="author-access-token" name="accessToken" type="password" autoComplete="off" required />
        </div>
        <Button type="submit" variant="outline" disabled={isTokenPending}>
          {isTokenPending ? "Входим…" : "Войти по токену"}
        </Button>
      </form>
      {error ? <Alert variant="destructive">{ERROR_MESSAGES[error]}</Alert> : null}
    </div>
  );
}
