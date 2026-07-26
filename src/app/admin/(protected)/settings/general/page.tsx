import { Archive } from "lucide-react";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { ArchiveSettingsForm } from "../archive/archive-settings-form";
import { SettingsSectionHeader } from "../settings-section-header";

export default async function AdminGeneralSettingsPage() {
  const settings = await getArchiveSettings();
  return <section><SettingsSectionHeader icon={<Archive />} title="Общие" description="Ограничения для записей и структуры серий." /><div className="mt-5"><ArchiveSettingsForm mediaItemTitleAliasLimit={settings.maxTitleAliases} maxFranchiseDepth={settings.maxFranchiseDepth} /></div></section>;
}
