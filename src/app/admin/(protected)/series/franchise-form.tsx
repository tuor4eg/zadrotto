"use client";

import Link from "next/link";
import { Eye, Save } from "lucide-react";
import { useState } from "react";

import { FranchiseDuplicateCheck } from "@/components/franchise-duplicate-check";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type FranchiseFormValues = {
  id?: number;
  code?: string;
  title?: string;
  originalTitle?: string | null;
  description?: string | null;
};

type FranchiseFormProps = {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  values?: FranchiseFormValues;
  errorMessage?: string | null;
  publicHref?: string | null;
  successMessage?: string | null;
};

export function FranchiseForm({
  action,
  submitLabel,
  values,
  errorMessage,
  publicHref,
  successMessage,
}: FranchiseFormProps) {
  const isEditing = Boolean(values?.id);
  const [title, setTitle] = useState(values?.title ?? "");
  const [originalTitle, setOriginalTitle] = useState(values?.originalTitle ?? "");
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts
        clearParams={["attached", "detached", "error", "updated"]}
        messages={toastMessages}
      />

      {values?.id ? <input type="hidden" name="franchiseId" value={values.id} /> : null}

      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="franchise-title">Название</Label>
          <Input id="franchise-title" name="title" type="text" value={title} onChange={(event) => setTitle(event.currentTarget.value)} required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="franchise-original-title">Оригинальное название</Label>
        <Input id="franchise-original-title" name="originalTitle" type="text" value={originalTitle} onChange={(event) => setOriginalTitle(event.currentTarget.value)} />
      </div>

      {!isEditing ? (
        <FranchiseDuplicateCheck title={title} originalTitle={originalTitle} onBlockedChange={setDuplicateBlocked} />
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="franchise-description">Описание</Label>
        <Textarea
          id="franchise-description"
          name="description"
          defaultValue={values?.description ?? ""}
          rows={5}
          className="min-h-32"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={duplicateBlocked}
        >
          <Save />
          {submitLabel}
        </Button>
        {publicHref ? (
          <Link href={publicHref} className={buttonVariants({ variant: "outline" })}>
            <Eye />
            Открыть на сайте
          </Link>
        ) : (
          <Button type="button" variant="outline" disabled>
            <Eye />
            Серия не опубликована
          </Button>
        )}
      </div>
    </form>
  );
}
