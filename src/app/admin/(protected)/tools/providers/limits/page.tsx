import {
  getCoverProviderRateLimits,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { getProviderCoverSearchRateLimitUsage } from "@/lib/covers/rate-limits";
import { ProviderLimitsForm } from "../provider-limits-form";

export default async function AdminSettingsProviderLimitsPage() {
  const [settings, providerRateLimits] = await Promise.all([
    getCoverSettings(),
    getCoverProviderRateLimits(),
  ]);
  const providerRateLimitUsage = await getProviderCoverSearchRateLimitUsage(
    providerRateLimits,
  );

  return (
    <section>
      <ProviderLimitsForm
        providerRateLimits={providerRateLimits}
        providerRateLimitUsage={providerRateLimitUsage}
        settings={settings}
      />
    </section>
  );
}
