"use client";

import { getPersonalDataConsentRequirement } from "@/app/author/consent/actions";
import { CURRENT_CONSENT_VERSION } from "@/lib/privacy/consent";
import Link from "next/link";

import { useActionState, useCallback, useEffect, useState } from "react";

import { AuthorToasts } from "@/app/author/(protected)/author-toasts";
import { PasswordField, PasswordInput } from "@/components/auth/password-field";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
  AUTHOR_LOGIN_MAX_LENGTH,
  AUTHOR_PASSWORD_MAX_LENGTH,
  AUTHOR_PASSWORD_MIN_LENGTH,
} from "@/lib/auth/author-account";
import {
  registerAuthorAction,
  type AuthorRegistrationState,
} from "./actions";
import { RegistrationStartedAtInput } from "./registration-started-at-input";

const ERROR_MESSAGES: Record<
  NonNullable<AuthorRegistrationState>["error"],
  string
> = {
  consent: "Подтверди согласие с действующей версией документа. Если она изменилась, обнови страницу.",
  "email-taken": "Этот email уже используется другим аккаунтом.",
  "login-taken": "Этот логин уже занят.",
  invalid: "Проверь имя, логин, email и пароль.",
  turnstile: "Не удалось подтвердить запрос. Пройди проверку ещё раз.",
  unavailable: "Регистрация временно недоступна. Попробуй позже.",
};

export function AuthorRegistrationForm({
  consentRequired: initialConsentRequired,
  turnstileRequired,
  turnstileSiteKey,
}: {
  consentRequired: boolean;
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, isPending] = useActionState(registerAuthorAction, null);
  const [consentRequired, setConsentRequired] = useState(initialConsentRequired);
  const [consentAccepted, setConsentAccepted] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getPersonalDataConsentRequirement().then((required) => {
        if (!active) return;
        setConsentRequired(required);
        if (!required) setConsentAccepted(false);
      }).catch(() => { /* Keep the last server value; submission is checked again on the server. */ });
    };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [initialConsentRequired]);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isTurnstileVerified, setIsTurnstileVerified] = useState(!turnstileRequired);

  const handleTurnstileVerifiedChange = useCallback((verified: boolean) => {
    setIsTurnstileVerified(verified);
  }, []);

  return (
    <form action={formAction} className="grid gap-4">
      <AuthorToasts
        messages={state?.error
          ? [{ id: state.error, tone: "error", text: ERROR_MESSAGES[state.error] }]
          : []}
      />
      <RegistrationStartedAtInput />
      <input className="hidden" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="grid gap-2">
        <Label htmlFor="name">Имя</Label>
        <Input id="name" name="name" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="login">Логин</Label>
        <Input id="login" name="login" maxLength={AUTHOR_LOGIN_MAX_LENGTH} value={login} onChange={(event) => setLogin(event.currentTarget.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
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
        <PasswordInput
          id="passwordConfirmation"
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={AUTHOR_PASSWORD_MIN_LENGTH}
          maxLength={AUTHOR_PASSWORD_MAX_LENGTH}
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.currentTarget.value)}
          required
        />
      </div>
      {turnstileRequired && turnstileSiteKey ? (
        <TurnstileWidget
          action="author_register"
          fieldName="turnstileToken"
          onVerifiedChange={handleTurnstileVerifiedChange}
          resetKey={state}
          siteKey={turnstileSiteKey}
        />
      ) : null}
      {consentRequired ? <>
      <input type="hidden" name="consentVersion" value={CURRENT_CONSENT_VERSION} />
      <div className="flex items-start gap-2 text-sm leading-5">
        <input id="consentAccepted" name="consentAccepted" type="checkbox" value="yes" required checked={consentAccepted}
          onChange={(event) => setConsentAccepted(event.currentTarget.checked)} className="mt-1 shrink-0" />
        <label htmlFor="consentAccepted">Даю согласие на обработку персональных данных в соответствии с{' '}
          <Link href="/consent" target="_blank" rel="noopener noreferrer" className="underline">Согласием на обработку персональных данных</Link>.
        </label>
      </div>
      </> : null}
      <Button type="submit" disabled={isPending || !isTurnstileVerified || (consentRequired && !consentAccepted)}>
        {isPending ? "Регистрируем…" : "Регистрация"}
      </Button>
    </form>
  );
}
