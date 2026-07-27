import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type MediaTypeFormValues = {
  code?: string;
  description?: string | null;
  id?: number;
  enabledByDefault?: boolean;
  isAvailableToGuests?: boolean;
  isPubliclyAvailable?: boolean;
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

        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isPubliclyAvailable"
            value="1"
            defaultChecked={values?.isPubliclyAvailable ?? false}
            className="mt-0.5 size-4 rounded border-stone-300 text-stone-950"
          />
          <span>
            <span className="block font-medium">Доступен пользователям</span>
            <span className="block text-xs leading-5 text-stone-500">
              Выключенный тип полностью скрыт в публичном интерфейсе независимо от личных настроек.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isAvailableToGuests"
            value="1"
            defaultChecked={values?.isAvailableToGuests ?? false}
            className="mt-0.5 size-4 rounded border-stone-300 text-stone-950"
          />
          <span>
            <span className="block font-medium">Доступен гостям</span>
            <span className="block text-xs leading-5 text-stone-500">
              Гостевой тип доступен анонимам и всем авторам без отдельного разрешения профиля.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="enabledByDefault"
            value="1"
            defaultChecked={values?.enabledByDefault ?? true}
            className="mt-0.5 size-4 rounded border-stone-300 text-stone-950"
          />
          <span>
            <span className="block font-medium">Включён по умолчанию</span>
            <span className="block text-xs leading-5 text-stone-500">
              Применяется к анонимам и пользователям без личного переопределения.
            </span>
          </span>
        </label>

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
