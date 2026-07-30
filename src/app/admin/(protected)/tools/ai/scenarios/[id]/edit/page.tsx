import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAiProviderScenarioDefaults } from "@/db/queries/ai-providers";
import { getAiScenarioProfileById } from "@/db/queries/ai-scenarios";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { getAiProviderSettingFields } from "@/lib/ai/schema";
import { getAiScenarioDefinition } from "@/lib/ai/scenarios/catalog";
import { PageHeader } from "../../../../../admin-ui";
import { AdminToasts, type AdminToast } from "../../../../../admin-toasts";
import { updateAiScenarioAction } from "../../actions";
import { ScenarioForm, type ScenarioFormProvider } from "../../scenario-form";

export default async function EditAiScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [profile, defaults] = await Promise.all([
    getAiScenarioProfileById(id),
    getAiProviderScenarioDefaults(),
  ]);
  if (!profile) notFound();
  const definition = getAiScenarioDefinition(profile.key);
  if (!definition) notFound();

  const providers: ScenarioFormProvider[] = aiProviderRegistry.list()
    .map(({ code, label, settingFields }) => ({
      code,
      label,
      settingFields: getAiProviderSettingFields(settingFields),
      defaultModelId: defaults.find((item) => item.providerCode === code)?.defaultModelId ?? null,
      settings: defaults.find((item) => item.providerCode === code)?.settings ?? {},
    }));
  if (!providers.some(({ code }) => code === profile.providerCode)) {
    providers.unshift({
      code: profile.providerCode,
      label: profile.providerCode,
      settingFields: [],
      defaultModelId: null,
      settings: {},
      legacy: true,
    });
  }
  const messages = [
    ...(query.updated === "1"
      ? [{ id: "scenario-updated", tone: "success" as const, text: "Сценарий сохранён." }]
      : []),
    ...(query.error
      ? [{
          id: "scenario-update-error",
          tone: "error" as const,
          text: "Не удалось сохранить сценарий. Проверьте поля и готовность провайдера.",
        }]
      : []),
  ] satisfies AdminToast[];

  return (
    <div className="mx-auto max-w-2xl">
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <PageHeader
        title={definition.name}
        description="Настройки AI-сценария."
        aside={
          <Link href="/admin/tools/ai/scenarios" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Назад
          </Link>
        }
      />
      <Card className="mt-5">
        <CardContent className="pt-5">
          <ScenarioForm
            action={updateAiScenarioAction}
            profile={profile}
            providers={providers}
            submitLabel="Сохранить"
          />
        </CardContent>
      </Card>
    </div>
  );
}
