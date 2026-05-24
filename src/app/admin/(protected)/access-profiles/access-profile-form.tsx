import { Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { formatUploadLimitMegabytes } from "@/lib/author-access-profile-form";

type AccessProfileFormValues = {
  id?: number;
  name?: string;
  canPublishMediaWithoutReview?: boolean;
  maxDraftMediaItems?: number | null;
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
  return (
    <form action={action} className="grid gap-5" noValidate>
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

        <div className="grid gap-4 sm:grid-cols-3">
          <LimitField
            id="access-profile-max-drafts"
            label="Черновиков"
            name="maxDraftMediaItems"
            defaultValue={values?.maxDraftMediaItems?.toString() ?? ""}
          />
          <LimitField
            id="access-profile-max-upload"
            label="Загрузка, МБ"
            name="maxUploadMegabytes"
            defaultValue={formatUploadLimitMegabytes(values?.maxUploadBytes ?? null)}
          />
          <LimitField
            id="access-profile-max-files"
            label="Файлов на запись"
            name="maxFilesPerMediaItem"
            defaultValue={values?.maxFilesPerMediaItem?.toString() ?? ""}
          />
        </div>
      </div>

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div>
        <Button type="submit">
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function LimitField({
  id,
  label,
  name,
  defaultValue,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
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
      />
    </div>
  );
}
