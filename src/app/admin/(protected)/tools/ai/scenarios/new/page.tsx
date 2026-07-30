import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAiProviderScenarioDefaults } from "@/db/queries/ai-providers";
import { getAiScenarioProfiles } from "@/db/queries/ai-scenarios";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { getAiProviderSettingFields } from "@/lib/ai/schema";
import { listAiScenarioCatalogEntries } from "@/lib/ai/scenarios/catalog";
import { EmptyState, PageHeader } from "../../../../admin-ui";
import { AdminToasts, type AdminToast } from "../../../../admin-toasts";
import { createAiScenarioAction } from "../actions";
import { ScenarioForm } from "../scenario-form";

export default async function NewAiScenarioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, defaults, profiles] = await Promise.all([
    searchParams,
    getAiProviderScenarioDefaults(),
    getAiScenarioProfiles(),
  ]);
  const existingKeys = new Set(profiles.map(({ key }) => key));
  const availableScenarios = listAiScenarioCatalogEntries()
    .filter(({ key }) => !existingKeys.has(key));
  const providers = aiProviderRegistry.list().map(({ code, label, settingFields }) => ({
    code,
    label,
    settingFields: getAiProviderSettingFields(settingFields),
    defaultModelId: defaults.find((item) => item.providerCode === code)?.defaultModelId ?? null,
    settings: defaults.find((item) => item.providerCode === code)?.settings ?? {},
  }));
  const messages = params.error
    ? [{
        id: "scenario-create-error",
        tone: "error" as const,
        text: "Не удалось создать сценарий. Проверьте поля и готовность провайдера.",
      }]
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <AdminToasts clearParams={["error"]} messages={messages satisfies AdminToast[]} />
      <PageHeader
        title="Новый сценарий"
        description="Профиль модели и параметров для серверной AI-задачи."
        aside={
          <Link href="/admin/tools/ai/scenarios" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Назад
          </Link>
        }
      />
      <Card className="mt-5">
        <CardContent className="pt-5">
          {providers.length && availableScenarios.length ? (
            <ScenarioForm
              action={createAiScenarioAction}
              catalogEntries={availableScenarios}
              providers={providers}
              submitLabel="Создать"
            />
          ) : (
            <EmptyState>
              {!providers.length
                ? "Сначала добавьте хотя бы один AI-провайдер."
                : "Все системные сценарии уже созданы. Вернитесь к списку сценариев."}
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
