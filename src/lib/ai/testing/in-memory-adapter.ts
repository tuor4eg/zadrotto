import type { AiProviderAdapter } from "../types";

export function createInMemoryAiAdapter(
  behavior: Partial<AiProviderAdapter> = {},
): AiProviderAdapter {
  return {
    code: "in-memory",
    label: "In-memory",
    capabilities: { text: true, object: true, modelCatalog: true },
    credentialFields: [{ key: "token", label: "Token", type: "secret", required: true }],
    settingFields: [],
    async listModels() { return [{ id: "test-model", label: "Test model" }]; },
    async validateCredentials() {},
    async generateText(request) {
      return { text: request.messages.at(-1)?.content ?? "", modelId: request.modelId };
    },
    async generateObject(request) {
      return { value: { text: request.messages.at(-1)?.content ?? "" }, modelId: request.modelId };
    },
    ...behavior,
  };
}
