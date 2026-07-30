export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiFieldDefinition = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "secret";
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number | "any";
  description?: string;
};

export type AiParameters = Record<string, string | number | boolean>;
export type AiCredentials = Record<string, string>;

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AiTextResult = {
  text: string;
  modelId: string;
  usage?: AiUsage;
  providerRequestId?: string;
};

export type AiObjectResult = {
  value: unknown;
  modelId: string;
  usage?: AiUsage;
  providerRequestId?: string;
};

export type AiProviderContext = {
  credentials: AiCredentials;
  signal: AbortSignal;
};

export type AiGenerationRequest = {
  messages: AiMessage[];
  modelId: string;
  parameters: AiParameters;
};

export type AiObjectGenerationRequest = AiGenerationRequest & {
  schema: Record<string, unknown>;
};

export type AiModel = {
  id: string;
  label: string;
  isFree?: boolean;
};

export type AiProviderAdapter = {
  code: string;
  label: string;
  capabilities: {
    text: boolean;
    object: boolean;
    modelCatalog: boolean;
  };
  credentialFields: readonly AiFieldDefinition[];
  settingFields: readonly AiFieldDefinition[];
  listModels?: (context: AiProviderContext) => Promise<AiModel[]>;
  validateCredentials: (context: AiProviderContext) => Promise<void>;
  generateText: (
    request: AiGenerationRequest,
    context: AiProviderContext,
  ) => Promise<AiTextResult>;
  generateObject: (
    request: AiObjectGenerationRequest,
    context: AiProviderContext,
  ) => Promise<AiObjectResult>;
};

export const AI_ERROR_CODES = [
  "configuration",
  "authentication",
  "rate-limit",
  "timeout",
  "provider-unavailable",
  "invalid-response",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiError";
  }
}
