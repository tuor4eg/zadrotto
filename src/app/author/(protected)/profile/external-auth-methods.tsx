import { getExternalAuthIdentities } from "@/db/operations/external-auth";
import { getExternalAuthAdapters } from "@/lib/auth/external/registry";
import { isExternalProviderAvailable } from "@/lib/auth/external/model";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { unlinkExternalProviderAction } from "./external-auth-actions";

export async function ExternalAuthMethods({ authorId, currentIdentityId }: {
  authorId: number; currentIdentityId: number | null;
}) {
  const identities = await getExternalAuthIdentities(authorId);
  const adapters = await getExternalAuthAdapters();
  const available = adapters.filter(isExternalProviderAvailable);
  if (!identities.length && !available.length) return null;
  return <section className="grid gap-3 rounded-md border p-4" aria-label="Способы входа">
    <h2 className="font-semibold">Способы входа</h2>
    {identities.map((identity) => {
      const adapter = adapters.find(({ code }) => code === identity.provider);
      const status = !adapter ? "Интеграция недоступна" : !adapter.configured ? "Вход не настроен"
        : !adapter.enabled ? "Вход временно отключён" : "Подключён";
      return <div key={identity.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="min-w-0"><p className="break-words font-medium">{adapter?.name ?? identity.provider}</p>
          {identity.displayValue ? <p className="break-words text-sm">{identity.displayValue}</p> : null}
          <p className="text-sm text-stone-600">{status}</p>
        </div>
        <ConfirmAction action={unlinkExternalProviderAction} fields={[{ name: "identityId", value: identity.id }]}
          title="Отключить способ входа?" triggerLabel="Отключить" confirmLabel="Отключить"
          description={`После отключения сессии, созданные через этот сервис, будут завершены. На других устройствах может потребоваться повторный вход.${currentIdentityId === identity.id ? " Текущая сессия тоже будет завершена: потребуется войти заново." : ""}`} />
      </div>;
    })}
    {available.filter((adapter) => !identities.some(({ provider }) => provider === adapter.code)).map((adapter) =>
      <form key={adapter.code} method="post" action={`/author/auth/${encodeURIComponent(adapter.code)}/start`}>
        <input type="hidden" name="intent" value="link" />
        <Button type="submit" variant="outline">Подключить {adapter.name}</Button>
      </form>)}
  </section>;
}
