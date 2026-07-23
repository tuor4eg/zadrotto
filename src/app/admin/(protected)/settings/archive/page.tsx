import { Archive } from "lucide-react";

import { getArchiveSettings } from "@/db/queries/archive-settings";
import { ArchiveSettingsForm } from "./archive-settings-form";
import { SettingsSectionHeader } from "../settings-section-header";

export default async function AdminArchiveSettingsPage() {
  const settings = await getArchiveSettings();

  return (
    <section>
      <SettingsSectionHeader
        icon={<Archive />}
        title="Архив"
        description="Ограничения и параметры архивных записей."
      />
      <div className="mt-5">
        <ArchiveSettingsForm
          mediaItemTitleAliasLimit={settings.maxTitleAliases}
        />
      </div>
    </section>
  );
}
