import { getAuthorAccessTokens } from "@/db/queries/author-access-tokens";
import { getAuthors } from "@/db/queries/authors";
import { revokeAuthorTokenAction } from "./actions";
import { CreateAuthorTokenForm } from "./create-author-token-form";

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

function formatStatus(revokedAt: Date | null) {
  return revokedAt ? "отозван" : "активен";
}

export default async function AdminAuthorTokensPage() {
  const [tokens, authors] = await Promise.all([getAuthorAccessTokens(), getAuthors()]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Токены авторов</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Токены доступа для будущих авторских сценариев.
            </p>
          </div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
            {tokens.length} всего
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="border border-zinc-200 p-5 text-sm text-zinc-500">
            Токены пока не созданы.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 border border-zinc-200">
            {tokens.map((token) => {
              const status = formatStatus(token.revokedAt);

              return (
                <div
                  key={token.id}
                  className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_150px_150px_90px_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-950">
                      {token.authorName}
                    </div>
                    <div className="mt-1 font-mono text-xs text-zinc-500">{token.authorCode}</div>
                  </div>
                  <div className="min-w-0 text-sm text-zinc-700">{token.label}</div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {formatDate(token.createdAt)}
                  </div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {formatDate(token.lastUsedAt)}
                  </div>
                  <div
                    className={`w-fit border px-2 py-1 text-xs font-medium ${
                      status === "активен"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {status}
                  </div>
                  <form action={revokeAuthorTokenAction}>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <button
                      type="submit"
                      className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-red-700 hover:text-red-700"
                    >
                      Отозвать
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Новый токен
        </h2>
        <CreateAuthorTokenForm authors={authors} />
      </aside>
    </div>
  );
}
