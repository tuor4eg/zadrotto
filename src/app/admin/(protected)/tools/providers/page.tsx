import {
  getCoverProviderCredentialStatuses,
  getCoverProviderSettings,
  getCoverProviderImageSettings,
} from "@/db/queries/cover-settings";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import { ProvidersForm } from "./providers-form";

export default async function AdminSettingsProvidersPage() {
  const [providerSettings, credentialStatuses, mediaTypes, imageSettings] = await Promise.all([
    getCoverProviderSettings(),
    getCoverProviderCredentialStatuses(),
    getMediaTypeOptions(),
    getCoverProviderImageSettings(),
  ]);
  const credentialStatusesByProviderCode = new Map(
    credentialStatuses.map((status) => [status.providerCode, status]),
  );
  const availableProviderSettings = providerSettings.map((provider) => ({
    ...provider,
    enabled:
      provider.enabled &&
      (!coverProviderRequiresCredentials(provider.providerCode) ||
        Boolean(credentialStatusesByProviderCode.get(provider.providerCode)?.hasCredentials)),
  }));

  return (
    <section>
      <ProvidersForm
        credentialStatuses={credentialStatuses}
        mediaTypes={mediaTypes}
        providerSettings={availableProviderSettings}
        imageSettings={imageSettings}
      />
    </section>
  );
}
