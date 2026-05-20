"use client";

import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps, buttonVariants } from "./button";

type ConfirmActionField = {
  name: string;
  value: string | number;
};

type ConfirmActionProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelLabel?: string;
  className?: string;
  confirmLabel: string;
  confirmVariant?: ButtonProps["variant"];
  description: string;
  disabled?: boolean;
  fields?: ConfirmActionField[];
  title: string;
  triggerAriaLabel?: string;
  triggerIcon?: React.ReactNode;
  triggerLabel: string;
  triggerSize?: ButtonProps["size"];
  triggerVariant?: ButtonProps["variant"];
};

export function ConfirmAction({
  action,
  cancelLabel = "Отмена",
  className,
  confirmLabel,
  confirmVariant = "destructive",
  description,
  disabled = false,
  fields = [],
  title,
  triggerAriaLabel,
  triggerIcon,
  triggerLabel,
  triggerSize = "sm",
  triggerVariant = "destructive",
}: ConfirmActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={cn(buttonVariants({ variant: triggerVariant, size: triggerSize }), className)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        onClick={() => setIsOpen(true)}
      >
        {triggerIcon}
        {triggerSize === "icon" ? <span className="sr-only">{triggerLabel}</span> : triggerLabel}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть подтверждение"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">
                  {description}
                </p>
              </div>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
                aria-label="Закрыть"
                onClick={() => setIsOpen(false)}
              >
                <X />
              </button>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                {cancelLabel}
              </Button>
              <form action={action}>
                {fields.map((field) => (
                  <input
                    key={field.name}
                    type="hidden"
                    name={field.name}
                    value={field.value}
                  />
                ))}
                <Button type="submit" variant={confirmVariant}>
                  {confirmLabel}
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
