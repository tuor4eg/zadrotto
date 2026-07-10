import {
  getCoverProviderRateLimits,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { ProviderLimitsForm } from "../provider-limits-form";

export default async function AdminSettingsProviderLimitsPage() {
  const [settings, providerRateLimits] = await Promise.all([
    getCoverSettings(),
    getCoverProviderRateLimits(),
  ]);

  return (
    <section>
      <ProviderLimitsForm
        providerRateLimits={providerRateLimits}
        settings={settings}
      />
    </section>
  );
}
