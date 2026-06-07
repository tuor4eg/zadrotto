import { ImageIcon } from "lucide-react";

import {
  getCoverProviderCredentialStatuses,
  getCoverProviderRateLimits,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import { CoverSettingsForm } from "../cover-settings-form";
import { SettingsSectionHeader } from "../settings-section-header";

export default async function AdminSettingsCoversPage() {
  const [
    coverSettings,
    coverProviderSettings,
    providerRateLimits,
    credentialStatuses,
    mediaTypes,
  ] = await Promise.all([
    getCoverSettings(),
    getCoverProviderSettings(),
    getCoverProviderRateLimits(),
    getCoverProviderCredentialStatuses(),
    getMediaTypeOptions(),
  ]);
  const credentialStatusesByProviderCode = new Map(
    credentialStatuses.map((status) => [status.providerCode, status]),
  );
  const availableProviderSettings = coverProviderSettings.map((provider) => ({
    ...provider,
    enabled:
      provider.enabled &&
      (!coverProviderRequiresCredentials(provider.providerCode) ||
        Boolean(credentialStatusesByProviderCode.get(provider.providerCode)?.hasCredentials)),
  }));

  return (
    <section>
      <SettingsSectionHeader
        icon={<ImageIcon />}
        title="Обложки"
        description="Лимиты поиска и порядок внешних источников для подбора обложек."
      />
      <div className="mt-5">
        <CoverSettingsForm
          credentialStatuses={credentialStatuses}
          mediaTypes={mediaTypes}
          providerRateLimits={providerRateLimits}
          settings={coverSettings}
          providerSettings={availableProviderSettings}
        />
      </div>
    </section>
  );
}
