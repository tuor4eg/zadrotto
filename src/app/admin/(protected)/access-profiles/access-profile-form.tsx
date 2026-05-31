import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { formatUploadLimitMegabytes } from "@/lib/author-access-profile-form";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type AccessProfileFormValues = {
  id?: number;
  name?: string;
  canPublishMediaWithoutReview?: boolean;
  maxDraftMediaItems?: number | null;
  maxDraftMediaItemsPerDay?: number | null;
  maxUploadBytes?: number | null;
  maxFilesPerMediaItem?: number | null;
};

type AccessProfileFormProps = {
  action: (formData: FormData) => Promise<void>;
  errorMessage?: string | null;
  successMessage?: string | null;
  submitLabel: string;
  values?: AccessProfileFormValues;
};

export function AccessProfileForm({
  action,
  errorMessage,
  successMessage,
  submitLabel,
  values,
}: AccessProfileFormProps) {
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="profileId" value={values.id} /> : null}

      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="access-profile-name">Название</Label>
          <Input
            id="access-profile-name"
            name="name"
            type="text"
            required
            defaultValue={values?.name ?? ""}
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            name="canPublishMediaWithoutReview"
            value="1"
            defaultChecked={values?.canPublishMediaWithoutReview ?? false}
            className="size-4 rounded border-stone-300 text-stone-950"
          />
          Публикация без проверки
        </label>

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-950">Лимиты</h3>
          </div>

          <div className="grid gap-3">
            <LimitSection title="Записи">
              <LimitField
                id="access-profile-max-drafts"
                label="Приватных всего"
                name="maxDraftMediaItems"
                defaultValue={values?.maxDraftMediaItems?.toString() ?? ""}
              />
              <LimitField
                id="access-profile-max-drafts-per-day"
                label="Приватных в сутки"
                name="maxDraftMediaItemsPerDay"
                defaultValue={values?.maxDraftMediaItemsPerDay?.toString() ?? ""}
              />
            </LimitSection>

            <LimitSection title="Файлы">
              <LimitField
                id="access-profile-max-upload"
                label="Загрузка, МБ"
                name="maxUploadMegabytes"
                defaultValue={formatUploadLimitMegabytes(values?.maxUploadBytes ?? null)}
                disabled
              />
              <LimitField
                id="access-profile-max-files"
                label="Файлов на запись"
                name="maxFilesPerMediaItem"
                defaultValue={values?.maxFilesPerMediaItem?.toString() ?? ""}
                disabled
              />
            </LimitSection>
          </div>
        </section>
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

function LimitSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-stone-200 bg-stone-50/60 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {children}
      </div>
    </fieldset>
  );
}

function LimitField({
  id,
  label,
  name,
  defaultValue,
  disabled = false,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        defaultValue={defaultValue}
        disabled={disabled}
      />
    </div>
  );
}
