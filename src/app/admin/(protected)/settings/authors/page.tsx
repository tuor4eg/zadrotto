import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { getAuthorRegistrationSettingsDiagnostics } from "@/db/queries/author-registration-settings";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { EmptyState } from "../../admin-ui";
import { SettingsSectionHeader } from "../settings-section-header";
import { updateAuthorRegistrationSettingsAction } from "./actions";

type PageProps = { searchParams: Promise<{ error?: string; updated?: string }> };

export default async function AdminSettingsAuthorsPage({ searchParams }: PageProps) {
  const [profiles, params] = await Promise.all([
    getAuthorAccessProfiles({ assignableOnly: true }),
    searchParams,
  ]);
  const diagnostics = profiles.length > 0
    ? await getAuthorRegistrationSettingsDiagnostics()
    : null;
  const messages = [
    ...(params.updated === "1" ? [{ id: "updated", tone: "success" as const, text: "Профиль для новых авторов сохранён." }] : []),
    ...(params.error ? [{ id: "error", tone: "error" as const, text: "Выберите существующий несистемный профиль доступа." }] : []),
  ] satisfies AdminToast[];

  return (
    <section>
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <SettingsSectionHeader
        icon={<Users />}
        title="Авторы"
        description="Профиль доступа, который получают новые авторы при регистрации. Настройка действует только для будущих регистраций; при одобрении профиль можно изменить."
      />

      <div className="mt-5 max-w-2xl">
        {profiles.length === 0 || !diagnostics ? (
          <EmptyState>Нет несистемных профилей, которые можно назначить новым авторам. Сначала создай профиль доступа.</EmptyState>
        ) : (
          <form action={updateAuthorRegistrationSettingsAction} className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
            {diagnostics.source !== "database" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {diagnostics.source === "environment"
                  ? "Сейчас используется временная настройка AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE. Сохрани выбор здесь, чтобы перенести настройку в базу данных."
                  : "Профиль выбран автоматически как наиболее ограниченный. Сохрани явный выбор для предсказуемых регистраций."}
              </p>
            ) : null}

            <label className="block text-sm font-medium text-stone-800" htmlFor="accessProfileId">
              Профиль новых авторов
            </label>
            <select
              id="accessProfileId"
              name="accessProfileId"
              required
              defaultValue={diagnostics.effectiveProfile.id}
              className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950"
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <p className="text-sm leading-6 text-stone-500">Уже зарегистрированные авторы сохранят текущие профили.</p>
            <Button type="submit">Сохранить</Button>
          </form>
        )}
      </div>
    </section>
  );
}
