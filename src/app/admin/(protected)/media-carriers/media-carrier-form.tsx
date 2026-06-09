import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaType } from "@/lib/media/types";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type MediaCarrierFormValues = {
  code?: string;
  description?: string | null;
  id?: number;
  mediaTypes?: MediaType[];
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
  const selectedMediaTypes = new Set(
    values?.mediaTypes ?? (mediaTypes[0] ? [mediaTypes[0].code] : []),
  );
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
          <Label htmlFor="media-carrier-code">Код</Label>
          <Input
            id="media-carrier-code"
            name="code"
            type="text"
            required
            defaultValue={values?.code ?? ""}
            placeholder="vhs"
          />
          <p className="text-xs leading-5 text-stone-500">Например: vhs, pc, nes.</p>
        </div>

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

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium leading-none text-stone-700">Типы медиа</legend>
          <div className="grid gap-2 rounded-md border border-stone-200 bg-white p-3 sm:grid-cols-2">
            {mediaTypes.map((mediaType) => (
              <label
                key={mediaType.code}
                className="flex items-center gap-2 text-sm font-medium text-stone-700"
              >
                <input
                  type="checkbox"
                  name="mediaTypes"
                  value={mediaType.code}
                  defaultChecked={selectedMediaTypes.has(mediaType.code)}
                  className="size-4 rounded border-stone-300 text-stone-950"
                />
                {mediaType.name}
              </label>
            ))}
          </div>
        </fieldset>

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
