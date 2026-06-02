import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type MediaTypeFormValues = {
  code?: string;
  description?: string | null;
  id?: number;
  name?: string;
};

type MediaTypeFormProps = {
  action: (formData: FormData) => Promise<void>;
  errorMessage?: string | null;
  submitLabel: string;
  successMessage?: string | null;
  values?: MediaTypeFormValues;
};

export function MediaTypeForm({
  action,
  errorMessage,
  submitLabel,
  successMessage,
  values,
}: MediaTypeFormProps) {
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="mediaTypeId" value={values.id} /> : null}

      <div className="grid gap-4">
        {values?.code ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="media-type-code">Код</Label>
            <Input
              id="media-type-code"
              type="text"
              value={values.code}
              readOnly
              className="font-mono"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-type-name">Название</Label>
          <Input
            id="media-type-name"
            name="name"
            type="text"
            required
            defaultValue={values?.name ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-type-description">Описание</Label>
          <Textarea
            id="media-type-description"
            name="description"
            defaultValue={values?.description ?? ""}
            rows={4}
          />
        </div>
      </div>

      <div>
        <Button type="submit">
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
