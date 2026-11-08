import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { AccountMergeError, getAccountMergePreview } from "@/db/operations/account-merge";
import { requireAuthorSession } from "@/lib/auth/author-auth";
import type { AccountMergePreview } from "@/lib/auth/account-merge-model";
import { MergeForm, PrimaryAccountSelector } from "./merge-form";

export default async function AccountMergePage({ searchParams }: { searchParams: Promise<{ grant?: string; primary?: string }> }) {
  const [current, query] = await Promise.all([requireAuthorSession(), searchParams]);
  let preview: AccountMergePreview;
  try {
    preview = await getAccountMergePreview({
      grantId: query.grant ?? "",
      authorId: current.author.id,
      sessionId: current.session.sessionId,
      primaryAuthorId: query.primary ? Number(query.primary) : undefined,
    });
  } catch (error) {
    const code = error instanceof AccountMergeError ? error.code : "unavailable";
    const message = code === "expired" ? "Срок подтверждения истёк. Начни объединение заново."
      : code === "session-changed" ? "Сессия изменилась. Начни объединение заново в текущем аккаунте."
        : "Объединение недоступно. Начни подключение аккаунта заново или попробуй позже.";
    return <div className="max-w-3xl space-y-5"><h2 className="font-serif text-3xl">Объединение аккаунтов</h2><Alert variant="destructive">{message}</Alert><Link href="/author/profile" className="inline-block underline">Вернуться к профилю</Link></div>;
  }
  return <div className="max-w-3xl space-y-5">
    <h2 className="font-serif text-3xl">Объединение аккаунтов</h2>
    <p className="text-stone-600">Выбери основной аккаунт. Его имя, профиль и данные при совпадениях сохранятся; свободные данные второго аккаунта перейдут в него.</p>
    <PrimaryAccountSelector grantId={preview.grantId}>
      <fieldset className="space-y-3"><legend className="font-semibold">Основной аккаунт</legend>
        <div className="grid gap-3 sm:grid-cols-2">{preview.accounts.map((account) => <label key={account.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-4 has-checked:border-stone-900 has-checked:bg-stone-50">
          <input type="radio" name="primary" value={account.id} defaultChecked={preview.primaryAuthorId === account.id} className="mt-3" />
          <Avatar name={account.name} objectKey={account.avatarObjectKey} />
          <span className="min-w-0"><span className="block break-words font-semibold">{account.name}</span><span className="block break-all text-sm text-stone-600">{account.login ?? "Без логина"}</span><span className="mt-2 block text-sm text-stone-600">Оценки: {account.ratings} · Рецензии: {account.reviews}</span></span>
        </label>)}</div>
      </fieldset>
    </PrimaryAccountSelector>
    <section className="space-y-3" aria-label="Результат объединения"><h3 className="font-semibold">Что перейдёт в основной аккаунт</h3>
      <div className="grid gap-3 sm:grid-cols-2">{preview.counts.map((count) => <div key={count.label} className="rounded-md border p-4"><p className="font-medium">{count.label}</p><p className="mt-1 text-sm text-stone-600">Перейдёт: {count.transferred} · Совпадения: {count.conflicts}</p></div>)}</div>
    </section>
    <Alert><div className="space-y-2"><p>При совпадении оценок, рецензий и данных личного архива приоритет у основного аккаунта. Отброшенные данные нельзя восстановить через интерфейс. Объединение необратимо.</p><p>Все сессии и токены доступа обоих аккаунтов будут отозваны. На этом устройстве откроется новая сессия основного аккаунта.</p><p>Пароль основного аккаунта имеет приоритет. Если его нет, сохраняется пароль второго аккаунта. При совпадении внешних способов входа сохраняется привязка основного аккаунта.</p></div></Alert>
    {preview.disabledMethods.length ? <Alert><p className="font-medium">После объединения будут отключены способы входа:</p><ul className="mt-2 list-inside list-disc">{preview.disabledMethods.map((method) => <li key={method}>{method}</li>)}</ul></Alert> : null}
    <MergeForm key={preview.version} grantId={preview.grantId} primaryAuthorId={preview.primaryAuthorId} version={preview.version} />
  </div>;
}
