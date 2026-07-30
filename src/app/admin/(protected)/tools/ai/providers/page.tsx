import { EmptyState } from "../../../admin-ui";
import { getAiProviderAdminState } from "@/db/queries/ai-providers";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { getAiProviderSettingFields } from "@/lib/ai/schema";
import { AiProvidersForm } from "./provider-form";

export default async function AiProvidersPage() {
  const adapters = aiProviderRegistry.list();
  const state = await getAiProviderAdminState();
  if (adapters.length === 0) {
    return <section className="space-y-4"><div><h3 className="text-xl font-semibold">Провайдеры</h3>
      <p className="text-sm text-stone-500">Подключения к моделям для серверных AI-сценариев.</p></div>
      <EmptyState>AI-провайдеры ещё не добавлены. После регистрации первого адаптера его настройки появятся здесь.</EmptyState>
    </section>;
  }
  return <section className="space-y-4"><div><h3 className="text-xl font-semibold">Провайдеры</h3>
    <p className="mt-1 text-sm text-stone-500">Подключения к моделям для серверных AI-сценариев.</p></div>
    <AiProvidersForm providers={adapters.map((adapter) => ({
      adapter: {
        code: adapter.code, label: adapter.label, credentialFields: adapter.credentialFields,
        settingFields: getAiProviderSettingFields(adapter.settingFields),
      },
      settings: state.settings.find((item) => item.providerCode === adapter.code),
      credential: state.credentials.find((item) => item.providerCode === adapter.code),
    }))} />
  </section>;
}
