"use client";

import { useActionState, useState } from "react";
import { Copy, KeyRound } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
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
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="author-token-author">Автор</Label>
        <Select
          id="author-token-author"
          name="authorId"
          required
          disabled={!hasAuthors || isPending}
        >
          <option value="">Выбери автора</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="author-token-label">Метка</Label>
        <Input
          id="author-token-label"
          name="label"
          type="text"
          required
          disabled={!hasAuthors || isPending}
        />
      </div>

      {state.error ? (
        <Alert variant="destructive">{state.error}</Alert>
      ) : null}

      {state.accessToken ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-amber-800">
              Токен доступа показывается один раз
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyAccessToken}
            >
              <Copy />
              Скопировать
            </Button>
          </div>
          <code className="mt-2 block break-all font-mono text-xs leading-5 text-stone-950">
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

      <Button
        type="submit"
        disabled={!hasAuthors || isPending}
      >
        <KeyRound />
        {isPending ? "Создаем" : "Создать токен"}
      </Button>

      {!hasAuthors ? (
        <p className="text-sm text-stone-500">Сначала создай хотя бы одного обычного автора.</p>
      ) : null}
    </form>
  );
}
