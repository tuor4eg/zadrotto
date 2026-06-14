import { ShieldCheck } from "lucide-react";

import { ChangeAdminPasswordForm } from "../change-admin-password-form";
import { SettingsSectionHeader } from "../settings-section-header";
import { requireAdminUser } from "@/lib/auth/admin-auth";

export default async function AdminSettingsAdministratorPage() {
  const adminUser = await requireAdminUser();

  return (
    <section>
      <SettingsSectionHeader
        icon={<ShieldCheck />}
        title="Администратор"
        description="Пароль и доступ к админской части."
      />
      <div className="mt-5 max-w-2xl">
        <ChangeAdminPasswordForm adminLogin={adminUser.login} />
      </div>
    </section>
  );
}
