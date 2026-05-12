import { Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";

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
  successMessage?: string | null;
};

export function FranchiseForm({
  action,
  submitLabel,
  values,
  errorMessage,
  successMessage,
}: FranchiseFormProps) {
  return (
    <form action={action} className="grid gap-5">
      {values?.id ? <input type="hidden" name="franchiseId" value={values.id} /> : null}

      <div className="grid gap-4">
        <Field
          id="franchise-title"
          label="Название"
          name="title"
          defaultValue={values?.title ?? ""}
          required
        />
      </div>

      <Field
        id="franchise-original-title"
        label="Оригинальное название"
        name="originalTitle"
        defaultValue={values?.originalTitle ?? ""}
      />

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

      {successMessage ? (
        <Alert variant="success">{successMessage}</Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">{errorMessage}</Alert>
      ) : null}

      <div>
        <Button
          type="submit"
        >
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  required,
  monospace,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  monospace?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        required={required}
        className={monospace ? "font-mono" : ""}
      />
    </div>
  );
}
