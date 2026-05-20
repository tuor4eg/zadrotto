import { Ban, KeyRound, RotateCcw, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorAccessTokens } from "@/db/queries/author-access-tokens";
import { getAuthors } from "@/db/queries/authors";
import { getAdminFormErrorMessage } from "@/lib/app-error-messages";
import { EmptyState, PageHeader } from "../admin-ui";
import {
  deleteAuthorTokenAction,
  restoreAuthorTokenAction,
  revokeAuthorTokenAction,
} from "./actions";
import { CreateAuthorTokenForm } from "./create-author-token-form";

type AdminAuthorTokensPageProps = {
  searchParams: Promise<{
    updated?: string;
    error?: string;
  }>;
};

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

function getSuccessMessage(updated: string | undefined) {
  if (updated === "revoked") {
    return "Токен отозван.";
  }

  if (updated === "restored") {
    return "Токен снова активен.";
  }

  if (updated === "deleted") {
    return "Токен удален.";
  }

  return null;
}

export default async function AdminAuthorTokensPage({
  searchParams,
}: AdminAuthorTokensPageProps) {
  const [tokens, authors, params] = await Promise.all([
    getAuthorAccessTokens(),
    getAuthors(),
    searchParams,
  ]);
  const errorMessage = getAdminFormErrorMessage(params.error);
  const successMessage = getSuccessMessage(params.updated);
  const tokenAuthors = authors.filter((author) => !author.isSystem);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <PageHeader
          title="Токены авторов"
          description="Токены доступа для будущих авторских сценариев."
          aside={<Badge variant="outline">{tokens.length} всего</Badge>}
        />

        {successMessage ? (
          <Alert variant="success" className="mt-5">{successMessage}</Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive" className="mt-5">{errorMessage}</Alert>
        ) : null}

        {tokens.length === 0 ? (
          <EmptyState className="mt-5">Токены пока не созданы.</EmptyState>
        ) : (
          <div className="mt-5 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {tokens.map((token) => {
              const status = formatStatus(token.revokedAt);
              const isRevoked = Boolean(token.revokedAt);

              return (
                <div
                  key={token.id}
                  className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_150px_150px_90px_110px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-950">
                      {token.authorName}
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-stone-700">{token.label}</div>
                  <div className="text-xs tabular-nums text-stone-500">
                    {formatDate(token.createdAt)}
                  </div>
                  <div className="text-xs tabular-nums text-stone-500">
                    {formatDate(token.lastUsedAt)}
                  </div>
                  <div
                    className="w-fit"
                  >
                    <Badge variant={status === "активен" ? "positive" : "default"}>{status}</Badge>
                  </div>
                  <div className="flex flex-nowrap justify-end gap-1.5">
                    {isRevoked ? (
                      <form action={restoreAuthorTokenAction} className="shrink-0">
                        <input type="hidden" name="tokenId" value={token.id} />
                        <Tooltip label="Сделать активным">
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            aria-label={`Сделать токен ${token.label} активным`}
                          >
                            <RotateCcw />
                          </Button>
                        </Tooltip>
                      </form>
                    ) : (
                      <form action={revokeAuthorTokenAction} className="shrink-0">
                        <input type="hidden" name="tokenId" value={token.id} />
                        <Tooltip label="Отозвать">
                          <Button
                            type="submit"
                            variant="destructive"
                            size="icon"
                            aria-label={`Отозвать токен ${token.label}`}
                          >
                            <Ban />
                          </Button>
                        </Tooltip>
                      </form>
                    )}
                    <Tooltip label="Удалить">
                      <ConfirmAction
                        action={deleteAuthorTokenAction}
                        fields={[{ name: "tokenId", value: token.id }]}
                        title="Удалить токен?"
                        description={`Токен «${token.label}» для автора ${token.authorName} будет полностью удален. Это действие нельзя отменить.`}
                        triggerLabel="Удалить"
                        triggerAriaLabel={`Удалить токен ${token.label}`}
                        triggerIcon={<Trash2 />}
                        triggerSize="icon"
                        confirmLabel="Удалить токен"
                      />
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Новый токен
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAuthorTokenForm authors={tokenAuthors} />
        </CardContent>
      </Card>
    </div>
  );
}
