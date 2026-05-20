"use client";

import { useLayoutEffect, useRef } from "react";

import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type AutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AutoResizeTextarea({
  className,
  onInput,
  ...props
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resizeTextarea() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  useLayoutEffect(() => {
    resizeTextarea();
  }, [props.defaultValue, props.value]);

  return (
    <Textarea
      ref={textareaRef}
      className={cn("resize-none overflow-hidden", className)}
      onInput={(event) => {
        resizeTextarea();
        onInput?.(event);
      }}
      {...props}
    />
  );
}
