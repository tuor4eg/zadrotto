import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openRouterAiProvider } from "@/lib/ai/providers/openrouter";
import { deepSeekAiProvider } from "@/lib/ai/providers/deepseek";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { AiError, type AiGenerationRequest } from "@/lib/ai/types";

const apiKey = "sk-or-test-secret";

function context() {
  return {
    credentials: { apiKey },
    signal: new AbortController().signal,
  };
}

function textRequest(parameters: AiGenerationRequest["parameters"] = {}): AiGenerationRequest {
  return {
    modelId: "openai/gpt-test",
    messages: [
      { role: "system", content: "Format metadata." },
      { role: "user", content: "Dune" },
    ],
    parameters,
  };
}

async function withFetch(
  implementation: typeof fetch,
  operation: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertAiError(
  code: AiError["code"],
  options?: { secret?: string },
) {
  return (error: unknown) => {
    assert.ok(error instanceof AiError);
    assert.equal(error.code, code);
    if (options?.secret) {
      assert.doesNotMatch(String(error), new RegExp(options.secret));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(options.secret));
    }
    return true;
  };
}

describe("OpenRouter credentials", () => {
  it("validates credentials through /key and requires a data object", async () => {
    await withFetch(async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/key");
      assert.deepEqual(init?.headers, { Authorization: `Bearer ${apiKey}` });
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({ data: { label: "test key" } });
    }, async () => {
      await openRouterAiProvider.validateCredentials(context());
    });

    await withFetch(async () => Response.json({ ok: true }), async () => {
      await assert.rejects(
        openRouterAiProvider.validateCredentials(context()),
        assertAiError("invalid-response"),
      );
    });
  });

  it("classifies /key HTTP failures and malformed success payloads", async () => {
    for (const [status, code] of [
      [401, "authentication"],
      [403, "authentication"],
      [429, "rate-limit"],
      [500, "provider-unavailable"],
    ] as const) {
      await withFetch(async () => Response.json(
        { error: { message: apiKey } },
        { status },
      ), async () => {
        await assert.rejects(
          openRouterAiProvider.validateCredentials(context()),
          assertAiError(code, { secret: apiKey }),
        );
      });
    }

    await withFetch(async () => new Response("{", { status: 200 }), async () => {
      await assert.rejects(
        openRouterAiProvider.validateCredentials(context()),
        assertAiError("invalid-response", { secret: apiKey }),
      );
    });
  });
});

describe("OpenRouter model catalog", () => {
  it("requests text models, forwards the signal, maps, filters, and deduplicates", async () => {
    const requestContext = context();
    await withFetch(async (input, init) => {
      assert.equal(
        String(input),
        "https://openrouter.ai/api/v1/models?output_modalities=text",
      );
      assert.equal(init?.signal, requestContext.signal);
      assert.deepEqual(init?.headers, { Authorization: `Bearer ${apiKey}` });
      return Response.json({
        data: [
          { id: "openai/gpt-test", name: " GPT Test ",
            architecture: { output_modalities: ["text"] },
            pricing: { prompt: "0.1", completion: "0.2" } },
          { id: "openai/gpt-test", name: "Duplicate" },
          { id: "vendor/fallback-label:free",
            architecture: { output_modalities: ["text"] },
            pricing: { prompt: "0.1", completion: "0.2" } },
          { id: "vendor/free-by-price", name: "Free by price",
            pricing: { prompt: "0", completion: "0" } },
          { id: "vendor/not-free", name: "Not free",
            pricing: { prompt: 0, completion: 0 } },
          { id: "vendor/unknown-price", name: "Unknown price",
            pricing: { prompt: "unknown", completion: "0" } },
          { id: "vendor/image", name: "Image", architecture: { output_modalities: ["image"] } },
          { id: "unsafe id", name: "Unsafe" },
          null,
        ],
      });
    }, async () => {
      assert.deepEqual(await openRouterAiProvider.listModels?.(requestContext), [
        { id: "openai/gpt-test", label: "GPT Test", isFree: false },
        {
          id: "vendor/fallback-label:free",
          label: "vendor/fallback-label:free",
          isFree: true,
        },
        { id: "vendor/free-by-price", label: "Free by price", isFree: true },
        { id: "vendor/not-free", label: "Not free" },
        { id: "vendor/unknown-price", label: "Unknown price" },
      ]);
    });
  });

  it("rejects malformed model payloads", async () => {
    for (const payload of [{}, { data: null }, { data: {} }]) {
      await withFetch(async () => Response.json(payload), async () => {
        await assert.rejects(
          openRouterAiProvider.listModels?.(context()),
          assertAiError("invalid-response"),
        );
      });
    }
  });
});

describe("OpenRouter generation", () => {
  it("sends exact text headers/body and maps response metadata", async () => {
    await withFetch(async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      });
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "openai/gpt-test",
        messages: textRequest().messages,
        temperature: 0,
        max_completion_tokens: 120,
        top_p: 0.8,
        frequency_penalty: -0.5,
        presence_penalty: 0.25,
      });
      return Response.json({
        id: "gen-123",
        model: "openai/gpt-actual",
        choices: [{ message: { content: "formatted" } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      });
    }, async () => {
      assert.deepEqual(await openRouterAiProvider.generateText(textRequest({
        temperature: 0,
        maxOutputTokens: 120,
        topP: 0.8,
        frequencyPenalty: -0.5,
        presencePenalty: 0.25,
        timeoutMs: 30_000,
      }), context()), {
        text: "formatted",
        modelId: "openai/gpt-actual",
        providerRequestId: "gen-123",
        usage: { inputTokens: 11, outputTokens: 7 },
      });
    });
  });

  it("omits unset and internal parameters from the request body", async () => {
    await withFetch(async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "openai/gpt-test",
        messages: textRequest().messages,
      });
      return Response.json({ choices: [{ message: { content: "ok" } }] });
    }, async () => {
      assert.deepEqual(await openRouterAiProvider.generateText(
        textRequest({ timeoutMs: 30_000 }),
        context(),
      ), {
        text: "ok",
        modelId: "openai/gpt-test",
        usage: undefined,
        providerRequestId: undefined,
      });
    });
  });

  it("requests strict structured JSON and parses its content", async () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    };
    await withFetch(async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "openai/gpt-test",
        messages: textRequest().messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "structured_response",
            strict: true,
            schema,
          },
        },
        provider: { require_parameters: true },
      });
      return Response.json({
        choices: [{ message: { content: "{\"title\":\"Dune\"}" } }],
      });
    }, async () => {
      assert.deepEqual(await openRouterAiProvider.generateObject(
        { ...textRequest(), schema },
        context(),
      ), {
        value: { title: "Dune" },
        modelId: "openai/gpt-test",
        usage: undefined,
        providerRequestId: undefined,
      });
    });
  });

  it("falls back to validated prompt JSON when native structured routing is unavailable", async () => {
    let calls = 0;
    await withFetch(async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
        response_format?: unknown;
      };
      if (calls <= 2) {
        assert.ok(body.response_format);
        return Response.json({ error: { message: "route unavailable" } }, { status: 503 });
      }
      assert.equal(body.response_format, undefined);
      assert.match(body.messages[0]?.content ?? "", /Верни только валидный JSON/);
      return Response.json({
        choices: [{ message: { content: "```json\n{\"title\":\"Dune\"}\n```" } }],
      });
    }, async () => {
      const result = await openRouterAiProvider.generateObject(
        {
          ...textRequest(),
          schema: {
            type: "object",
            required: ["title"],
            properties: { title: { type: "string" } },
          },
        },
        context(),
      );
      assert.deepEqual(result.value, { title: "Dune" });
    });
    assert.equal(calls, 3);
  });

  it("rejects invalid structured JSON", async () => {
    await withFetch(async () => Response.json({
      choices: [{ message: { content: "not-json" } }],
    }), async () => {
      await assert.rejects(
        openRouterAiProvider.generateObject(
          { ...textRequest(), schema: { type: "object" } },
          context(),
        ),
        assertAiError("invalid-response", { secret: apiKey }),
      );
    });
  });

  it("retries one transient provider-unavailable generation failure", async () => {
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: { message: "temporarily unavailable" } }, { status: 503 })
        : Response.json({
            choices: [{ message: { content: "ok" } }],
          });
    }, async () => {
      assert.equal((await openRouterAiProvider.generateText(textRequest(), context())).text, "ok");
    });
    assert.equal(calls, 2);
  });

  it("classifies HTTP statuses without leaking provider payloads", async () => {
    for (const [status, code] of [
      [401, "authentication"],
      [403, "configuration"],
      [429, "rate-limit"],
      [503, "provider-unavailable"],
      [504, "timeout"],
      [400, "configuration"],
    ] as const) {
      await withFetch(async () => Response.json(
        { error: { message: `provider says ${apiKey}` } },
        { status },
      ), async () => {
        await assert.rejects(
          openRouterAiProvider.generateText(textRequest(), context()),
          assertAiError(code, { secret: apiKey }),
        );
      });
    }
  });

  it("maps HTTP 200 choice permission errors to configuration", async () => {
    await withFetch(async () => Response.json({
      choices: [{
        error: {
          code: 403,
          message: `provider says ${apiKey}`,
          metadata: { error_type: "permission_denied" },
        },
      }],
    }), async () => {
      await assert.rejects(
        openRouterAiProvider.generateText(textRequest(), context()),
        assertAiError("configuration", { secret: apiKey }),
      );
    });
  });

  it("rejects top-level, choice, and finish-reason errors from HTTP 200", async () => {
    const payloads = [
      { error: { code: 429, message: apiKey } },
      { choices: [{ error: { code: 429, message: apiKey } }] },
      { choices: [{ finish_reason: "error", message: { content: "partial" } }] },
    ];
    for (const payload of payloads) {
      await withFetch(async () => Response.json(payload), async () => {
        await assert.rejects(
          openRouterAiProvider.generateText(textRequest(), context()),
          (error: unknown) => {
            assert.ok(error instanceof AiError);
            assert.ok(["rate-limit", "invalid-response"].includes(error.code));
            assert.doesNotMatch(String(error), new RegExp(apiKey));
            assert.doesNotMatch(JSON.stringify(error), new RegExp(apiKey));
            return true;
          },
        );
      });
    }
  });
});

describe("production AI registry", () => {
  it("contains OpenRouter and DeepSeek", () => {
    assert.deepEqual(aiProviderRegistry.list().map(({ code }) => code), [
      "openrouter",
      "deepseek",
    ]);
    assert.equal(aiProviderRegistry.get("openrouter"), openRouterAiProvider);
    assert.equal(aiProviderRegistry.get("deepseek"), deepSeekAiProvider);
  });
});
