"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ProviderCredentialFields } from "@/components/ui/provider-credential-fields";
import { EXTERNAL_AUTH_PROVIDER_DEFINITIONS } from "@/lib/auth/external/provider-definitions";
import { saveAuthProviderAction } from "./actions";

export function AuthProviderForm({ settings, provider, callbackUrl }: { settings: { enabled: boolean; clientId: string; hasSecret: boolean }; provider: typeof EXTERNAL_AUTH_PROVIDER_DEFINITIONS[number]; callbackUrl: string }) {
  const [state, action, pending] = useActionState(saveAuthProviderAction, { error: null, success: null });
  return (
    <form action={action} className="grid max-w-xl gap-4 rounded-md border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">{provider.name}</h2>
      <input type="hidden" name="providerCode" value={provider.code} />
      <ProviderCredentialFields fields={provider.fields} idPrefix={`auth-${provider.code}`} inputProps={(name) => ({
        type: name === "clientId" ? "text" : "password",
        defaultValue: name === "clientId" ? settings.clientId : "",
        disabled: pending,
        placeholder: name === "clientSecret" && settings.hasSecret ? "Сохранён. Оставьте пустым, чтобы сохранить." : undefined,
      })} />
      <p className="text-sm">{settings.clientId && settings.hasSecret ? "Данные приложения сохранены." : "Данные приложения не настроены."}</p>
      <div className="grid gap-1 text-sm"><span className="font-medium">Redirect URI</span><code className="break-all rounded bg-stone-100 p-2">{callbackUrl}</code></div>
      <p className="text-sm text-stone-500">Client ID нельзя менять, пока есть связанные аккаунты. Пустой Client Secret сохраняет существующий секрет.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} disabled={pending} />Включить вход через {provider.name}</label>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : "Сохранить"}</Button>
    </form>
  );
}
