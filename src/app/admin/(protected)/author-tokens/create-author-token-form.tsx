"use client";

import { useActionState, useState } from "react";

import type { getAuthors } from "@/db/queries/authors";
import {
  createAuthorTokenAction,
  type CreateAuthorTokenState,
} from "./actions";

type AuthorTokenCreateFormProps = {
  authors: Awaited<ReturnType<typeof getAuthors>>;
};

const initialState: CreateAuthorTokenState = {
  accessToken: null,
  error: null,
};

export function CreateAuthorTokenForm({ authors }: AuthorTokenCreateFormProps) {
  const [state, formAction, isPending] = useActionState(createAuthorTokenAction, initialState);
  const [copiedAccessToken, setCopiedAccessToken] = useState<string | null>(null);
  const [failedAccessToken, setFailedAccessToken] = useState<string | null>(null);
  const hasAuthors = authors.length > 0;
  const isCopied = state.accessToken !== null && copiedAccessToken === state.accessToken;
  const isFailed = state.accessToken !== null && failedAccessToken === state.accessToken;

  async function copyAccessToken() {
    if (!state.accessToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.accessToken);
      setCopiedAccessToken(state.accessToken);
      setFailedAccessToken(null);
    } catch {
      setFailedAccessToken(state.accessToken);
      setCopiedAccessToken(null);
    }
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="author-token-author"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Автор
        </label>
        <select
          id="author-token-author"
          name="authorId"
          required
          disabled={!hasAuthors || isPending}
          className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          <option value="">Выбери автора</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name} ({author.code})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="author-token-label"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Метка
        </label>
        <input
          id="author-token-label"
          name="label"
          type="text"
          required
          disabled={!hasAuthors || isPending}
          className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-400"
        />
      </div>

      {state.error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.accessToken ? (
        <div className="border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              Токен доступа показывается один раз
            </div>
            <button
              type="button"
              onClick={copyAccessToken}
              className="border border-amber-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 transition-colors hover:border-zinc-950 hover:text-zinc-950"
            >
              Скопировать
            </button>
          </div>
          <code className="mt-2 block break-all font-mono text-xs leading-5 text-zinc-950">
            {state.accessToken}
          </code>
          {isCopied ? (
            <p className="mt-2 text-xs text-emerald-700">Скопировано в буфер.</p>
          ) : null}
          {isFailed ? (
            <p className="mt-2 text-xs text-red-700">Не удалось скопировать автоматически.</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!hasAuthors || isPending}
        className="h-10 border border-zinc-950 bg-zinc-950 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-zinc-950 disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        {isPending ? "Создаем" : "Создать токен"}
      </button>

      {!hasAuthors ? (
        <p className="text-sm text-zinc-500">Сначала создай хотя бы одного автора.</p>
      ) : null}
    </form>
  );
}
