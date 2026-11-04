"use client";

import type { ComponentProps } from "react";
import { Input, Label } from "@/components/ui/form";

export function ProviderCredentialFields({ fields, idPrefix, inputProps }: {
  fields: readonly { name: string; label: string; placeholder?: string }[];
  idPrefix: string;
  inputProps: (name: string) => ComponentProps<typeof Input>;
}) {
  return fields.map((field) => (
    <div key={field.name} className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-${field.name}`}>{field.label}</Label>
      <Input id={`${idPrefix}-${field.name}`} name={`credential:${field.name}`} type="password" autoComplete="off" placeholder={field.placeholder} {...inputProps(field.name)} />
    </div>
  ));
}
