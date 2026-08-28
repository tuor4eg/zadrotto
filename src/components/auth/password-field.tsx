"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
  "type"
>;

export function PasswordInput({ className, ...props }: PasswordFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        className={cn("pr-11", className)}
        type={isPasswordVisible ? "text" : "password"}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-stone-500 transition-colors hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900/20"
        aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={isPasswordVisible}
        onClick={() => setIsPasswordVisible((currentValue) => !currentValue)}
      >
        {isPasswordVisible
          ? <EyeOff className="size-4" aria-hidden="true" />
          : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function PasswordField(props: PasswordFieldProps) {
  const [internalPassword, setInternalPassword] = useState(
    typeof props.defaultValue === "string" ? props.defaultValue : "",
  );
  const hintId = useId();
  const password = typeof props.value === "string" ? props.value : internalPassword;
  const strength = getPasswordStrength(password);
  const describedBy = [props["aria-describedby"], hintId].filter(Boolean).join(" ");

  return (
    <div className="grid gap-2">
      <PasswordInput
        {...props}
        minLength={props.minLength ?? AUTHOR_PASSWORD_MIN_LENGTH}
        maxLength={props.maxLength ?? AUTHOR_PASSWORD_MAX_LENGTH}
        aria-describedby={describedBy}
        onChange={(event) => {
          setInternalPassword(event.currentTarget.value);
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
