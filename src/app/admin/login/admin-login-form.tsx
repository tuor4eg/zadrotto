"use client";

import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { loginAdmin } from "./actions";

type AdminLoginFormProps = {
  errorMessage: string | null;
};

export function AdminLoginForm({ errorMessage }: AdminLoginFormProps) {
  const [hasFreshPasswordInput, setHasFreshPasswordInput] = useState(false);

  useEffect(() => {
    const clearPassword = () => {
      const passwordInput = document.getElementById("admin-password");

      if (passwordInput instanceof HTMLInputElement) {
        passwordInput.value = "";
      }
      setHasFreshPasswordInput(false);
    };

    clearPassword();
    const timeoutId = window.setTimeout(clearPassword, 100);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <form action={loginAdmin} className="flex flex-col gap-4" autoComplete="off" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-login">Логин</Label>
        <Input
          id="admin-login"
          name="login"
          type="text"
          autoComplete="off"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-password">Пароль</Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          onInput={(event) => setHasFreshPasswordInput(event.currentTarget.value.length > 0)}
        />
      </div>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Button type="submit" disabled={!hasFreshPasswordInput}>
        <LogIn />
        Войти
      </Button>
    </form>
  );
}
