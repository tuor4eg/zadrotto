"use client";

import { useActionState, useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
  AUTHOR_PASSWORD_MAX_LENGTH,
  AUTHOR_PASSWORD_MIN_LENGTH,
} from "@/lib/auth/author-account";
import {
  onboardExistingAuthorAction,
  type AuthorOnboardingState,
} from "./actions";
import { AuthorToasts } from "../author-toasts";

const ERROR_MESSAGES: Record<
  NonNullable<AuthorOnboardingState>["error"],
  string
> = {
  "credentials-taken": "Этот логин и email уже используются другим аккаунтом.",
  "email-taken": "Этот email уже используется другим аккаунтом.",
  "login-taken": "Этот логин уже занят.",
  invalid: "Проверь логин, email и пароль.",
  unavailable: "Не удалось сохранить данные. Попробуй позже.",
};

export function AuthorOnboardingForm({
  bypassEmailVerification,
}: {
  bypassEmailVerification: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    onboardExistingAuthorAction,
    null,
  );
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  return (
    <form action={formAction} className="grid gap-4 rounded-md border p-5">
      <AuthorToasts
        messages={state?.error
          ? [{
              id: state.error,
              tone: "error",
              text: ERROR_MESSAGES[state.error],
            }]
          : []}
      />
      <div className="grid gap-2">
        <Label htmlFor="login">Логин</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          value={login}
          onChange={(event) => setLogin(event.currentTarget.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Пароль</Label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={AUTHOR_PASSWORD_MIN_LENGTH}
          maxLength={AUTHOR_PASSWORD_MAX_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passwordConfirmation">Повтори пароль</Label>
        <Input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={AUTHOR_PASSWORD_MIN_LENGTH}
          maxLength={AUTHOR_PASSWORD_MAX_LENGTH}
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.currentTarget.value)}
          required
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending
          ? "Сохраняем…"
          : bypassEmailVerification
            ? "Сохранить"
            : "Сохранить и подтвердить email"}
      </Button>
    </form>
  );
}
