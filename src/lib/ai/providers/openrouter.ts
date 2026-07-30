import {
  AiError,
  type AiCredentials,
  type AiGenerationRequest,
  type AiModel,
  type AiObjectGenerationRequest,
  type AiProviderAdapter,
  type AiProviderContext,
  type AiUsage,
} from "../types";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

function getApiKey(credentials: AiCredentials) {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) {
    throw new AiError("configuration", "API key OpenRouter не настроен.");
  }
  return apiKey;
}

function headers(credentials: AiCredentials, json = false) {
  return {
    Authorization: `Bearer ${getApiKey(credentials)}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function getOpenRouterError(value: unknown) {
  const payload = asRecord(value);
  const error = asRecord(payload?.error);
  const metadata = asRecord(error?.metadata);
  return {
    status: typeof error?.code === "number"
      ? error.code
      : typeof error?.code === "string" && /^\d{3}$/.test(error.code)
        ? Number(error.code)
        : null,
    type: typeof metadata?.error_type === "string" ? metadata.error_type : null,
  };
}

function classifyOpenRouterError(
  input: { status: number | null; type: string | null },
  operation: "credentials" | "generation",
) {
  if (
    input.type === "authentication" ||
    input.status === 401 ||
    (operation === "credentials" &&
      (input.type === "permission_denied" || input.status === 403))
  ) {
    return new AiError("authentication", "OpenRouter отклонил credentials.");
  }
  if (
    operation === "generation" &&
    (input.type === "permission_denied" || input.status === 403)
  ) {
    return new AiError("configuration", "OpenRouter заблокировал выполнение запроса.");
  }
  if (input.type === "rate_limit_exceeded" || input.status === 429) {
    return new AiError("rate-limit", "Лимит запросов OpenRouter исчерпан.");
  }
  if (input.type === "timeout" || input.status === 408 || input.status === 504) {
    return new AiError("timeout", "OpenRouter не ответил вовремя.");
  }
  if (
    input.type === "provider_unavailable" ||
    input.type === "provider_overloaded" ||
    (input.status !== null && input.status >= 500)
  ) {
    return new AiError("provider-unavailable", "OpenRouter временно недоступен.");
  }
  if (
    input.status === 400 ||
    input.status === 402 ||
    input.status === 404 ||
    input.status === 413 ||
    input.status === 422 ||
    input.type === "invalid_request" ||
    input.type === "invalid_prompt" ||
    input.type === "not_found" ||
    input.type === "payment_required" ||
    input.type === "context_length_exceeded" ||
    input.type === "max_tokens_exceeded" ||
    input.type === "token_limit_exceeded"
  ) {
    return new AiError("configuration", "OpenRouter отклонил параметры запроса.");
  }
  return new AiError("invalid-response", "OpenRouter вернул ошибку неизвестного формата.");
}

async function readJson(response: Response, operation: "credentials" | "generation") {
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch (error) {
    throw new AiError("invalid-response", "OpenRouter вернул ответ неверного формата.", {
      cause: error,
    });
  }
  if (!response.ok) {
    const remoteError = getOpenRouterError(payload);
    throw classifyOpenRouterError(
      {
        status: remoteError.status ?? response.status,
        type: remoteError.type,
      },
      operation,
    );
  }
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" &&
      value.length <= 240 &&
      /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)
    ? value
    : undefined;
}

function isNonNegativePrice(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function parseUsage(value: unknown): AiUsage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens;
  const outputTokens = usage.completion_tokens;
  const safeInput = typeof inputTokens === "number" && Number.isInteger(inputTokens) &&
      inputTokens >= 0 ? inputTokens : undefined;
  const safeOutput = typeof outputTokens === "number" && Number.isInteger(outputTokens) &&
      outputTokens >= 0 ? outputTokens : undefined;
  return safeInput === undefined && safeOutput === undefined
    ? undefined
    : { inputTokens: safeInput, outputTokens: safeOutput };
}

function parseChatResponse(value: unknown, requestedModelId: string) {
  const response = asRecord(value);
  if (response?.error) {
    throw classifyOpenRouterError(getOpenRouterError(response), "generation");
  }
  const choices = Array.isArray(response?.choices) ? response.choices : null;
  const choice = choices?.length ? asRecord(choices[0]) : null;
  if (choice?.error || choice?.finish_reason === "error") {
    throw classifyOpenRouterError(
      getOpenRouterError({ error: choice.error }),
      "generation",
    );
  }
  if (!choice) {
    throw new AiError("invalid-response", "OpenRouter не вернул результат генерации.");
  }
  const message = asRecord(choice.message);
  if (typeof message?.content !== "string" || !message.content) {
    throw new AiError("invalid-response", "OpenRouter не вернул текст ответа.");
  }
  const modelId = safeIdentifier(response?.model) ?? requestedModelId;
  const providerRequestId = safeIdentifier(response?.id);
  return {
    content: message.content,
    modelId,
    usage: parseUsage(response?.usage),
    providerRequestId,
  };
}

function generationBody(request: AiGenerationRequest) {
  const { parameters } = request;
  return {
    model: request.modelId,
    messages: request.messages,
    ...(typeof parameters.temperature === "number"
      ? { temperature: parameters.temperature }
      : {}),
    ...(typeof parameters.maxOutputTokens === "number"
      ? { max_completion_tokens: parameters.maxOutputTokens }
      : {}),
    ...(typeof parameters.topP === "number" ? { top_p: parameters.topP } : {}),
    ...(typeof parameters.frequencyPenalty === "number"
      ? { frequency_penalty: parameters.frequencyPenalty }
      : {}),
    ...(typeof parameters.presencePenalty === "number"
      ? { presence_penalty: parameters.presencePenalty }
      : {}),
  };
}

async function generate(
  request: AiGenerationRequest,
  context: AiProviderContext,
  structured?: { schema: Record<string, unknown> },
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: "POST",
        headers: headers(context.credentials, true),
        signal: context.signal,
        body: JSON.stringify({
          ...generationBody(request),
          ...(structured ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "structured_response",
                strict: true,
                schema: structured.schema,
              },
            },
            provider: { require_parameters: true },
          } : {}),
        }),
      });
      return parseChatResponse(await readJson(response, "generation"), request.modelId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      const normalized = error instanceof AiError
        ? error
        : new AiError("provider-unavailable", "Не удалось подключиться к OpenRouter.", {
            cause: error,
          });
      if (normalized.code !== "provider-unavailable" || attempt === 1) throw normalized;
    }
  }
  throw new AiError("provider-unavailable", "OpenRouter временно недоступен.");
}

export const openRouterAiProvider: AiProviderAdapter = {
  code: "openrouter",
  label: "OpenRouter",
  capabilities: { text: true, object: true, modelCatalog: true },
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      type: "secret",
      required: true,
      description: "Ключ OpenRouter. Сохранённое значение повторно не показывается.",
    },
  ],
  settingFields: [
    { key: "topP", label: "Top P", type: "number", min: 0, max: 1 },
    {
      key: "frequencyPenalty",
      label: "Штраф за частоту",
      type: "number",
      min: -2,
      max: 2,
    },
    {
      key: "presencePenalty",
      label: "Штраф за присутствие",
      type: "number",
      min: -2,
      max: 2,
    },
  ],
  async validateCredentials(context) {
    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_API_BASE}/key`, {
        headers: headers(context.credentials),
        signal: context.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new AiError("provider-unavailable", "Не удалось подключиться к OpenRouter.", {
        cause: error,
      });
    }
    const payload = asRecord(await readJson(response, "credentials"));
    if (!asRecord(payload?.data)) {
      throw new AiError("invalid-response", "OpenRouter не подтвердил API key.");
    }
  },
  async listModels(context) {
    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_API_BASE}/models?output_modalities=text`, {
        headers: headers(context.credentials),
        signal: context.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new AiError("provider-unavailable", "Не удалось получить модели OpenRouter.", {
        cause: error,
      });
    }
    const payload = asRecord(await readJson(response, "credentials"));
    const data = Array.isArray(payload?.data) ? payload.data : null;
    if (!data) {
      throw new AiError("invalid-response", "OpenRouter вернул неверный каталог моделей.");
    }
    const models = new Map<string, AiModel>();
    for (const item of data) {
      const model = asRecord(item);
      if (!model) continue;
      const architecture = asRecord(model.architecture);
      const outputModalities = Array.isArray(architecture?.output_modalities)
        ? architecture.output_modalities
        : null;
      if (outputModalities && !outputModalities.includes("text")) continue;
      const id = safeIdentifier(model?.id);
      if (!id) continue;
      const label = typeof model.name === "string" && model.name.trim() &&
          model.name.length <= 240
        ? model.name.trim()
        : id;
      const pricing = asRecord(model.pricing);
      const hasKnownPricing =
        isNonNegativePrice(pricing?.prompt) &&
        isNonNegativePrice(pricing?.completion);
      const isFree = id.endsWith(":free")
        ? true
        : hasKnownPricing
          ? pricing.prompt === "0" && pricing.completion === "0"
          : undefined;
      if (!models.has(id)) {
        models.set(id, {
          id,
          label,
          ...(isFree === undefined ? {} : { isFree }),
        });
      }
    }
    return [...models.values()];
  },
  async generateText(request, context) {
    const response = await generate(request, context);
    return {
      text: response.content,
      modelId: response.modelId,
      usage: response.usage,
      providerRequestId: response.providerRequestId,
    };
  },
  async generateObject(request: AiObjectGenerationRequest, context) {
    let response;
    try {
      response = await generate(request, context, { schema: request.schema });
    } catch (error) {
      if (!(error instanceof AiError) || error.code !== "provider-unavailable") throw error;
      response = await generate({
        ...request,
        messages: [
          {
            role: "system",
            content: [
              "Верни только валидный JSON без Markdown и пояснений.",
              `JSON должен соответствовать этой схеме: ${JSON.stringify(request.schema)}`,
            ].join("\n"),
          },
          ...request.messages,
        ],
      }, context);
    }
    let value: unknown;
    try {
      value = JSON.parse(response.content.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""));
    } catch (error) {
      throw new AiError("invalid-response", "OpenRouter вернул невалидный JSON.", {
        cause: error,
      });
    }
    return {
      value,
      modelId: response.modelId,
      usage: response.usage,
      providerRequestId: response.providerRequestId,
    };
  },
};
