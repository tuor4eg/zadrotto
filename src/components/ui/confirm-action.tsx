"use client";

import { useState } from "react";

import { cn } from "@/lib/common/utils";
import { Button, type ButtonProps, buttonVariants } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

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
        <ConfirmDialog
          cancelLabel={cancelLabel}
          description={description}
          onClose={() => setIsOpen(false)}
          title={title}
        >
          <form action={action}>
            {fields.map((field) => (
              <input key={field.name} name={field.name} type="hidden" value={field.value} />
            ))}
            <Button type="submit" variant={confirmVariant}>{confirmLabel}</Button>
          </form>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
