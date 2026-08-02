import { Archive } from "lucide-react";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { ArchiveSettingsForm } from "../archive/archive-settings-form";
import { SettingsSectionHeader } from "../settings-section-header";

export default async function AdminGeneralSettingsPage() {
  const settings = await getArchiveSettings();
  return <section><SettingsSectionHeader icon={<Archive />} title="Общие" description="Ограничения для записей, досье дня, истории просмотров и структуры серий." /><div className="mt-5"><ArchiveSettingsForm dailyDossierMinAverageScore={settings.dailyDossierMinAverageScore} mediaItemTitleAliasLimit={settings.maxTitleAliases} maxFranchiseDepth={settings.maxFranchiseDepth} recentlyViewedHistoryLimit={settings.recentlyViewedHistoryLimit} recentlyViewedTtlDays={settings.recentlyViewedTtlDays} /></div></section>;
}
