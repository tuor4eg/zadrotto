import { ShieldCheck } from "lucide-react";

import { ChangeAdminPasswordForm } from "../change-admin-password-form";
import { SettingsSectionHeader } from "../settings-section-header";

export default function AdminSettingsAdministratorPage() {
  return (
    <section>
      <SettingsSectionHeader
        icon={<ShieldCheck />}
        title="Администратор"
        description="Пароль и доступ к админской части."
      />
      <div className="mt-5 max-w-2xl">
        <ChangeAdminPasswordForm />
      </div>
    </section>
  );
}
