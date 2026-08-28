"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PasswordInput } from "@/components/auth/password-field";
import { ArchiveToasts } from "@/components/ui/archive-toasts";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
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
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const state = passwordState;

  useEffect(() => {
    if (!state?.ok) return;
    if (redirectOnSuccess || state.onboarding) {
      router.replace(state.onboarding ? "/author/profile" : "/author");
    }
    else onSuccess?.();
  }, [onSuccess, redirectOnSuccess, router, state]);

  const error = state && !state.ok ? state.error : initialError;

  return (
    <div className="flex flex-col gap-5">
      <ArchiveToasts
        messages={error
          ? [{ id: `author-login-${error}`, tone: "error", text: ERROR_MESSAGES[error] }]
          : []}
      />
      <form action={passwordFormAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-login-identity">Логин или email</Label>
          <Input
            id="author-login-identity"
            name="identity"
            autoComplete="username"
            value={identity}
            onChange={(event) => setIdentity(event.currentTarget.value)}
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author-login-password">Пароль</Label>
          <PasswordInput
            id="author-login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
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

    </div>
  );
}
