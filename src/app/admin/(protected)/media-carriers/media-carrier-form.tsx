import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaType } from "@/lib/media/types";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type MediaCarrierFormValues = {
  description?: string | null;
  id?: number;
  mediaType?: MediaType;
  name?: string;
};

type MediaCarrierFormProps = {
  action: (formData: FormData) => Promise<void>;
  errorMessage?: string | null;
  mediaTypes: Awaited<ReturnType<typeof getMediaTypeOptions>>;
  submitLabel: string;
  successMessage?: string | null;
  values?: MediaCarrierFormValues;
};

export function MediaCarrierForm({
  action,
  errorMessage,
  mediaTypes,
  submitLabel,
  successMessage,
  values,
}: MediaCarrierFormProps) {
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="carrierId" value={values.id} /> : null}

      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="media-carrier-name">Название</Label>
          <Input
            id="media-carrier-name"
            name="name"
            type="text"
            required
            defaultValue={values?.name ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-carrier-type">Тип медиа</Label>
          <Select
            id="media-carrier-type"
            name="mediaType"
            required
            defaultValue={values?.mediaType ?? mediaTypes[0]?.code ?? ""}
          >
            {mediaTypes.map((mediaType) => (
              <option key={mediaType.code} value={mediaType.code}>
                {mediaType.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-carrier-description">Описание</Label>
          <Textarea
            id="media-carrier-description"
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
