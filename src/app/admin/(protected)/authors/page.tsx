import { getAuthors } from "@/db/queries/authors";
import { listAuthorPermissionsByAuthorIds } from "@/lib/author-permission-service";
import {
  AUTHOR_PERMISSION_LABELS,
  PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION,
} from "@/lib/author-permissions";
import { createAuthorAction, updateAuthorPermissionAction } from "./actions";

type AdminAuthorsPageProps = {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
  }>;
};

function formatCreatedAt(createdAt: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(createdAt);
}

export default async function AdminAuthorsPage({ searchParams }: AdminAuthorsPageProps) {
  const [authors, params] = await Promise.all([getAuthors(), searchParams]);
  const errorMessage =
    params.error === "duplicate-code"
      ? "Автор с таким кодом уже существует."
      : params.error === "required"
        ? "Заполни имя и код."
        : params.error === "invalid-permission"
          ? "Не удалось сохранить право автора."
        : null;
  const wasCreated = params.created === "1";
  const wasUpdated = params.updated === "1";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Авторы</h2>
            <p className="mt-1 text-sm text-zinc-500">Участники, которые могут ставить оценки.</p>
          </div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
            {authors.length} всего
          </div>
        </div>

        {authors.length === 0 ? (
          <div className="border border-zinc-200 p-5 text-sm text-zinc-500">
            Авторы пока не добавлены.
          </div>
        ) : (
          <AuthorList authors={authors} />
        )}
      </section>

      <aside className="border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Новый автор
        </h2>

        <form action={createAuthorAction} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="author-name"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
            >
              Имя
            </label>
            <input
              id="author-name"
              name="name"
              type="text"
              required
              className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="author-code"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
            >
              Код
            </label>
            <input
              id="author-code"
              name="code"
              type="text"
              required
              className="h-10 border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-950 outline-none focus:border-zinc-950"
            />
          </div>

          {errorMessage ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
          {wasCreated ? (
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Автор создан.
            </p>
          ) : null}
          {wasUpdated ? (
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Права автора сохранены.
            </p>
          ) : null}

          <button
            type="submit"
            className="h-10 border border-zinc-950 bg-zinc-950 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-zinc-950"
          >
            Создать
          </button>
        </form>
      </aside>
    </div>
  );
}

async function AuthorList({ authors }: { authors: Awaited<ReturnType<typeof getAuthors>> }) {
  const permissionsByAuthorId = await listAuthorPermissionsByAuthorIds(
    authors.map((author) => author.id),
  );

  return (
    <div className="divide-y divide-zinc-200 border border-zinc-200">
      {authors.map((author) => {
        const hasPublishPermission =
          permissionsByAuthorId
            .get(author.id)
            ?.has(PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION) ?? false;

        return (
          <div
            key={author.id}
            className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_140px_190px_minmax(260px,0.9fr)]"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-950">{author.name}</div>
            </div>
            <div className="font-mono text-xs text-zinc-600">{author.code}</div>
            <div className="text-xs tabular-nums text-zinc-500">
              {formatCreatedAt(author.createdAt)}
            </div>
            <form action={updateAuthorPermissionAction} className="min-w-0">
              <input type="hidden" name="authorId" value={author.id} />
              <input
                type="hidden"
                name="permission"
                value={PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION}
              />
              <input
                type="hidden"
                name="enabled"
                value={hasPublishPermission ? "0" : "1"}
              />
              <button
                type="submit"
                className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs transition-colors ${
                  hasPublishPermission
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-500"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-950 hover:text-zinc-950"
                }`}
                aria-pressed={hasPublishPermission}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    hasPublishPermission
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : "border-zinc-300 bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {hasPublishPermission ? "✓" : null}
                </span>
                <span>{AUTHOR_PERMISSION_LABELS[PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION]}</span>
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
