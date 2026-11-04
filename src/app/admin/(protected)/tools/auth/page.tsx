import { getAuthProviderAdminSettings } from "@/db/queries/auth-provider-settings";
import { EXTERNAL_AUTH_PROVIDER_DEFINITIONS } from "@/lib/auth/external/provider-definitions";
import { getSiteOrigin } from "@/lib/site-url";
import { PageHeader } from "../../admin-ui";
import { AuthProviderForm } from "./auth-provider-form";

export default async function AuthProvidersPage() {
  const providers = await Promise.all(EXTERNAL_AUTH_PROVIDER_DEFINITIONS.map(async (provider) => ({
    provider,
    settings: await getAuthProviderAdminSettings(provider.code),
    callbackUrl: new URL(`/author/auth/${provider.code}/callback`, getSiteOrigin()).href,
  })));
  return <section className="grid gap-4"><PageHeader title="Авторизация" description="Внешние способы входа и данные OAuth-приложений." />
    {providers.map((entry) => <AuthProviderForm key={entry.provider.code} {...entry} />)}
  </section>;
}
