"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/form";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { getPasswordStrength, type PasswordStrengthLevel } from "@/lib/auth/password-strength";
import { cn } from "@/lib/common/utils";

const LEVEL_STYLES: Record<PasswordStrengthLevel, string> = {
  weak: "bg-red-500",
  fair: "bg-amber-500",
  good: "bg-lime-600",
  strong: "bg-emerald-600",
};

export type PasswordFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "type" | "value"
>;

export function PasswordField(props: PasswordFieldProps) {
  const [password, setPassword] = useState("");
  const hintId = useId();
  const strength = getPasswordStrength(password);
  const describedBy = [props["aria-describedby"], hintId].filter(Boolean).join(" ");

  return (
    <div className="grid gap-2">
      <Input
        {...props}
        type="password"
        minLength={props.minLength ?? AUTHOR_PASSWORD_MIN_LENGTH}
        maxLength={props.maxLength ?? AUTHOR_PASSWORD_MAX_LENGTH}
        aria-describedby={describedBy}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          props.onChange?.(event);
        }}
      />
      <div id={hintId} className="space-y-1.5" aria-live="polite">
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1 rounded-full bg-stone-200",
                strength && segment <= strength.score && LEVEL_STYLES[strength.level],
              )}
            />
          ))}
        </div>
        <p className="text-xs text-stone-500">
          {strength ? `Сложность пароля: ${strength.label}` : `Минимум ${AUTHOR_PASSWORD_MIN_LENGTH} символов`}
        </p>
      </div>
    </div>
  );
}
