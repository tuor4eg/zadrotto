import { Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { CoverFileInput } from "./cover-file-input";

type MediaFormValues = {
  id?: number;
  title?: string;
  originalTitle?: string | null;
  description?: string | null;
  mediaType?: MediaType;
  franchiseId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
};

type AdminMediaFormProps = {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  values?: MediaFormValues;
  errorMessage?: string | null;
  successMessage?: string | null;
};

export function AdminMediaForm({
  action,
  submitLabel,
  franchises,
  values,
  errorMessage,
  successMessage,
}: AdminMediaFormProps) {
  return (
    <form action={action} className="grid gap-5">
      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-title">Название</Label>
          <Input
            id="admin-media-title"
            name="title"
            type="text"
            defaultValue={values?.title ?? ""}
            required
          />
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-original-title">Оригинальное название</Label>
          <Input
            id="admin-media-original-title"
            name="originalTitle"
            type="text"
            defaultValue={values?.originalTitle ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-type">Тип медиа</Label>
          <Select
            id="admin-media-type"
            name="mediaType"
            defaultValue={values?.mediaType ?? "game"}
            required
          >
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-franchise">Серия</Label>
          <Select
            id="admin-media-franchise"
            name="franchiseId"
            defaultValue={values?.franchiseId ?? ""}
          >
            <option value="">Без серии</option>
            {franchises.map((franchise) => (
              <option key={franchise.id} value={franchise.id}>
                {franchise.originalTitle
                  ? `${franchise.title} / ${franchise.originalTitle}`
                  : franchise.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-release-year">Год</Label>
          <Input
            id="admin-media-release-year"
            name="releaseYear"
            type="number"
            min="0"
            max="9999"
            defaultValue={values?.releaseYear ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-cover-file">Обложка</Label>
          <CoverFileInput initialPreviewUrl={values?.coverUrl ?? null} />
          <p className="text-xs text-stone-500">JPG, PNG или WebP до 5 МБ.</p>
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-description">Описание</Label>
          <Textarea
            id="admin-media-description"
            name="description"
            defaultValue={values?.description ?? ""}
            rows={5}
            className="min-h-32"
          />
        </div>
      </div>

      {successMessage ? (
        <Alert variant="success">{successMessage}</Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">{errorMessage}</Alert>
      ) : null}

      <div>
        <Button type="submit">
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
