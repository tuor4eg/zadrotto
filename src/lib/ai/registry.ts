import { AiError, type AiProviderAdapter } from "./types";
import { deepSeekAiProvider } from "./providers/deepseek";
import { openRouterAiProvider } from "./providers/openrouter";

export function createAiProviderRegistry(adapters: readonly AiProviderAdapter[]) {
  const providers = new Map<string, AiProviderAdapter>();
  for (const adapter of adapters) {
    const code = adapter.code.trim();
    if (!code || providers.has(code)) {
      throw new Error(`Duplicate or empty AI provider code: ${code || "(empty)"}`);
    }
    providers.set(code, adapter);
  }

  return {
    list: () => [...providers.values()],
    get(code: string) {
      const adapter = providers.get(code);
      if (!adapter) {
        throw new AiError("configuration", `AI-провайдер «${code}» не зарегистрирован.`);
      }
      return adapter;
    },
  };
}

export const aiProviderRegistry = createAiProviderRegistry([
  openRouterAiProvider,
  deepSeekAiProvider,
]);
