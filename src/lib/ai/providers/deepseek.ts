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

const DEEPSEEK_API_BASE = "https://api.deepseek.com";
const DEPRECATED_MODEL_IDS = new Set(["deepseek-chat", "deepseek-reasoner"]);
const MODEL_LABELS: Record<string, string> = {
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getApiKey(credentials: AiCredentials) {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey) {
    throw new AiError("configuration", "API key DeepSeek не настроен.");
  }
  return apiKey;
}

function headers(credentials: AiCredentials, json = false) {
  return {
    Authorization: `Bearer ${getApiKey(credentials)}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" &&
      value.length <= 240 &&
      /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)
    ? value
    : undefined;
}

function errorStatusFromPayload(value: unknown) {
  const error = asRecord(asRecord(value)?.error);
  const code = error?.code;
  return typeof code === "number"
    ? code
    : typeof code === "string" && /^\d{3}$/.test(code)
      ? Number(code)
      : null;
}

function classifyDeepSeekError(status: number | null) {
  if (status === 401 || status === 403) {
    return new AiError("authentication", "DeepSeek отклонил данные авторизации.");
  }
  if (status === 429) {
    return new AiError("rate-limit", "Лимит запросов DeepSeek исчерпан.");
  }
  if (status === 408 || status === 504) {
    return new AiError("timeout", "DeepSeek не ответил вовремя.");
  }
  if (status === 500 || status === 502 || status === 503 || status === 507) {
    return new AiError("provider-unavailable", "DeepSeek временно недоступен.");
  }
  if (
    status === 400 ||
    status === 402 ||
    status === 404 ||
    status === 413 ||
    status === 422
  ) {
    return new AiError("configuration", "DeepSeek отклонил параметры запроса.");
  }
  return new AiError("invalid-response", "DeepSeek вернул ошибку неизвестного формата.");
}

async function readJson(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch (error) {
    if (!response.ok) {
      throw classifyDeepSeekError(response.status);
    }
    throw new AiError("invalid-response", "DeepSeek вернул ответ неверного формата.", {
      cause: error,
    });
  }
  if (!response.ok) {
    throw classifyDeepSeekError(errorStatusFromPayload(payload) ?? response.status);
  }
  if (asRecord(payload)?.error) {
    throw classifyDeepSeekError(errorStatusFromPayload(payload));
  }
  return payload;
}

function parseModels(value: unknown) {
  const data = asRecord(value)?.data;
  if (!Array.isArray(data)) {
    throw new AiError("invalid-response", "DeepSeek вернул неверный каталог моделей.");
  }

  const models = new Map<string, AiModel>();
  for (const item of data) {
    const id = safeIdentifier(asRecord(item)?.id);
    if (!id || DEPRECATED_MODEL_IDS.has(id) || models.has(id)) continue;
    models.set(id, {
      id,
      label: MODEL_LABELS[id] ?? id,
      isFree: false,
    });
  }
  return [...models.values()];
}

async function requestModels(context: AiProviderContext) {
  try {
    const response = await fetch(`${DEEPSEEK_API_BASE}/models`, {
      headers: headers(context.credentials),
      signal: context.signal,
    });
    return parseModels(await readJson(response));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof AiError) throw error;
    throw new AiError("provider-unavailable", "Не удалось подключиться к DeepSeek.", {
      cause: error,
    });
  }
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
  const choices = Array.isArray(response?.choices) ? response.choices : null;
  const choice = choices?.length ? asRecord(choices[0]) : null;
  if (!choice) {
    throw new AiError("invalid-response", "DeepSeek не вернул результат генерации.");
  }

  const finishReason = choice.finish_reason;
  if (finishReason === "insufficient_system_resource") {
    throw new AiError("provider-unavailable", "DeepSeek временно недоступен.");
  }
  if (finishReason !== "stop") {
    throw new AiError("invalid-response", "DeepSeek не завершил генерацию корректно.");
  }

  const content = asRecord(choice.message)?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiError("invalid-response", "DeepSeek не вернул текст ответа.");
  }

  return {
    content,
    modelId: safeIdentifier(response?.model) ?? requestedModelId,
    providerRequestId: safeIdentifier(response?.id),
    usage: parseUsage(response?.usage),
  };
}

function generationBody(request: AiGenerationRequest) {
  const { parameters } = request;
  return {
    model: request.modelId,
    messages: request.messages,
    thinking: {
      type: parameters.thinkingEnabled === true ? "enabled" : "disabled",
    },
    ...(typeof parameters.temperature === "number"
      ? { temperature: parameters.temperature }
      : {}),
    ...(typeof parameters.maxOutputTokens === "number"
      ? { max_tokens: parameters.maxOutputTokens }
      : {}),
    ...(typeof parameters.topP === "number" ? { top_p: parameters.topP } : {}),
  };
}

async function generate(
  request: AiGenerationRequest,
  context: AiProviderContext,
  structured?: { schema: Record<string, unknown> },
) {
  const messages = structured
    ? [
        {
          role: "system" as const,
          content: [
            "Верни только валидный JSON без Markdown и пояснений.",
            `JSON должен соответствовать этой схеме: ${JSON.stringify(structured.schema)}`,
          ].join("\n"),
        },
        ...request.messages,
      ]
    : request.messages;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
        method: "POST",
        headers: headers(context.credentials, true),
        signal: context.signal,
        body: JSON.stringify({
          ...generationBody({ ...request, messages }),
          ...(structured ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      return parseChatResponse(await readJson(response), request.modelId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      const normalized = error instanceof AiError
        ? error
        : new AiError("provider-unavailable", "Не удалось подключиться к DeepSeek.", {
            cause: error,
          });
      if (normalized.code !== "provider-unavailable" || attempt === 1) {
        throw normalized;
      }
    }
  }
  throw new AiError("provider-unavailable", "DeepSeek временно недоступен.");
}

export const deepSeekAiProvider: AiProviderAdapter = {
  code: "deepseek",
  label: "DeepSeek",
  capabilities: { text: true, object: true, modelCatalog: true },
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      type: "secret",
      required: true,
      description: "Ключ DeepSeek. Сохранённое значение повторно не показывается.",
    },
  ],
  settingFields: [
    { key: "topP", label: "Top P", type: "number", min: 0, max: 1 },
    {
      key: "thinkingEnabled",
      label: "Режим рассуждения",
      type: "boolean",
      defaultValue: false,
      description: "Повышает глубину ответа, но увеличивает задержку и расход токенов.",
    },
  ],
  async validateCredentials(context) {
    await requestModels(context);
  },
  async listModels(context) {
    return requestModels(context);
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
    const response = await generate(request, context, { schema: request.schema });
    let value: unknown;
    try {
      value = JSON.parse(response.content.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""));
    } catch (error) {
      throw new AiError("invalid-response", "DeepSeek вернул невалидный JSON.", {
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
