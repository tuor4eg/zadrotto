import { RotateCcw, Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { requireAuthor } from "@/lib/auth/author-auth";
import { AuthorToasts, type AuthorToast } from "../../author-toasts";
import {
  resetAuthorMediaTypeSettingsAction,
  saveAuthorMediaTypeSettingsAction,
} from "./actions";

type MediaTypeSettingsPageProps = {
  searchParams: Promise<{
    error?: string;
    reset?: string;
    saved?: string;
  }>;
};

function MediaTypeSettingsGroup({
  title,
  mediaTypes,
}: {
  title: string;
  mediaTypes: Awaited<ReturnType<typeof getEffectiveMediaTypeOptions>>;
}) {
  if (mediaTypes.length === 0) {
    return null;
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="font-serif text-2xl text-stone-950">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {mediaTypes.map((mediaType) => (
          <label
            key={mediaType.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-stone-300/80 bg-white/55 p-4"
          >
            <input type="hidden" name="mediaTypeId" value={mediaType.id} />
            <input
              className="mt-0.5 size-4 rounded border-stone-300"
              type="checkbox"
              name="enabledMediaTypeId"
              value={mediaType.id}
              defaultChecked={mediaType.isEnabled}
            />
            <span>
              <span className="block font-medium text-stone-950">{mediaType.name}</span>
              {mediaType.description ? (
                <span className="mt-1 block text-sm leading-5 text-stone-600">
                  {mediaType.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function MediaTypeSettingsPage({
  searchParams,
}: MediaTypeSettingsPageProps) {
  const [author, query] = await Promise.all([requireAuthor(), searchParams]);
  const mediaTypes = await getEffectiveMediaTypeOptions(author.id);
  const primaryMediaTypes = mediaTypes.filter(({ enabledByDefault }) => enabledByDefault);
  const additionalMediaTypes = mediaTypes.filter(({ enabledByDefault }) => !enabledByDefault);
  const toast: AuthorToast | null = query.saved
    ? { id: "saved", tone: "success", text: "Настройки сохранены." }
    : query.reset
      ? { id: "reset", tone: "success", text: "Восстановлены значения по умолчанию." }
      : query.error
        ? { id: "error", tone: "error", text: "Не удалось сохранить настройки." }
        : null;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-serif text-3xl leading-none text-stone-950">
          Интересующие типы медиа
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Выберите типы медиа, которые хотите видеть в каталоге, поиске, сериях, тегах и
          рекомендациях.
        </p>
      </div>

      <AuthorToasts
        clearParams={["error", "reset", "saved"]}
        messages={toast ? [toast] : []}
      />

      {mediaTypes.length === 0 ? (
        <Alert>Сейчас нет доступных типов медиа.</Alert>
      ) : (
        <form action={saveAuthorMediaTypeSettingsAction} className="grid gap-6">
          <MediaTypeSettingsGroup title="Основные типы" mediaTypes={primaryMediaTypes} />
          <MediaTypeSettingsGroup title="Дополнительные типы" mediaTypes={additionalMediaTypes} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <Save />
              Сохранить
            </Button>
          </div>
        </form>
      )}

      <form action={resetAuthorMediaTypeSettingsAction}>
        <Button type="submit" variant="outline">
          <RotateCcw />
          Вернуть значения по умолчанию
        </Button>
      </form>
    </div>
  );
}
