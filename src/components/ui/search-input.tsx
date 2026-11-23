"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/common/utils";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  bare?: boolean;
  containerClassName?: string;
  clearLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
};

export function SearchInput({
  bare = false,
  className,
  containerClassName,
  clearLabel = "Очистить поиск",
  onClose,
  closeLabel = "Закрыть поиск",
  onChange,
  value,
  defaultValue,
  disabled,
  readOnly,
  type = "search",
  ...props
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const hasValue = String(value ?? uncontrolledValue).length > 0;

  function clear() {
    const input = inputRef.current;
    if (!input || disabled || readOnly) return;
    // Use the native setter so React dispatches the field's normal change handler.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "");
    setUncontrolledValue("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  return (
    <span className={cn("relative block min-w-0", containerClassName)}>
      <input
        {...props}
        ref={inputRef}
        type={type}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          setUncontrolledValue(event.currentTarget.value);
          onChange?.(event);
        }}
        className={cn(
          !bare && "flex h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-950 shadow-xs outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400",
          className,
          "pr-10 [&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {(onClose || (hasValue && !readOnly)) ? (
        <button
          type="button"
          aria-label={onClose ? closeLabel : clearLabel}
          disabled={disabled}
          onClick={onClose ?? clear}
          className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </span>
  );
}
