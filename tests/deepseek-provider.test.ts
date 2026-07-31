import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deepSeekAiProvider } from "@/lib/ai/providers/deepseek";
import { AiError, type AiGenerationRequest } from "@/lib/ai/types";

const apiKey = "sk-deepseek-test-secret";

function context(signal = new AbortController().signal) {
  return {
    credentials: { apiKey },
    signal,
  };
}

function textRequest(parameters: AiGenerationRequest["parameters"] = {}): AiGenerationRequest {
  return {
    modelId: "deepseek-v4-flash",
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

function assertAiError(code: AiError["code"]) {
  return (error: unknown) => {
    assert.ok(error instanceof AiError);
    assert.equal(error.code, code);
    assert.doesNotMatch(String(error), new RegExp(apiKey));
    assert.doesNotMatch(JSON.stringify(error), new RegExp(apiKey));
    return true;
  };
}

describe("DeepSeek credentials and model catalog", () => {
  it("validates credentials and maps current paid models from /models", async () => {
    const requestContext = context();
    await withFetch(async (input, init) => {
      assert.equal(String(input), "https://api.deepseek.com/models");
      assert.equal(init?.signal, requestContext.signal);
      assert.deepEqual(init?.headers, { Authorization: `Bearer ${apiKey}` });
      return Response.json({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
          { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
          { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
          { id: "deepseek-chat", object: "model", owned_by: "deepseek" },
          { id: "deepseek-reasoner", object: "model", owned_by: "deepseek" },
          { id: "unsafe id", object: "model", owned_by: "deepseek" },
          null,
        ],
      });
    }, async () => {
      await deepSeekAiProvider.validateCredentials(requestContext);
      assert.deepEqual(await deepSeekAiProvider.listModels?.(requestContext), [
        {
          id: "deepseek-v4-flash",
          label: "DeepSeek V4 Flash",
          isFree: false,
        },
        {
          id: "deepseek-v4-pro",
          label: "DeepSeek V4 Pro",
          isFree: false,
        },
      ]);
    });
  });

  it("rejects authentication failures and malformed model catalogs", async () => {
    await withFetch(async () => Response.json(
      { error: { message: apiKey } },
      { status: 401 },
    ), async () => {
      await assert.rejects(
        deepSeekAiProvider.validateCredentials(context()),
        assertAiError("authentication"),
      );
    });

    await withFetch(async () => Response.json({ data: {} }), async () => {
      await assert.rejects(
        deepSeekAiProvider.listModels?.(context()),
        assertAiError("invalid-response"),
      );
    });
  });
});

describe("DeepSeek generation", () => {
  it("sends text parameters with thinking disabled and maps response metadata", async () => {
    await withFetch(async (input, init) => {
      assert.equal(String(input), "https://api.deepseek.com/chat/completions");
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      });
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "deepseek-v4-flash",
        messages: textRequest().messages,
        thinking: { type: "disabled" },
        temperature: 0,
        max_tokens: 120,
        top_p: 0.8,
      });
      return Response.json({
        id: "ds-request-123",
        model: "deepseek-v4-flash",
        choices: [{
          finish_reason: "stop",
          message: { content: "formatted", role: "assistant" },
        }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      });
    }, async () => {
      assert.deepEqual(await deepSeekAiProvider.generateText(textRequest({
        temperature: 0,
        maxOutputTokens: 120,
        topP: 0.8,
        thinkingEnabled: false,
        timeoutMs: 30_000,
      }), context()), {
        text: "formatted",
        modelId: "deepseek-v4-flash",
        providerRequestId: "ds-request-123",
        usage: { inputTokens: 11, outputTokens: 7 },
      });
    });
  });

  it("enables thinking without forwarding internal timeout settings", async () => {
    await withFetch(async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "deepseek-v4-flash",
        messages: textRequest().messages,
        thinking: { type: "enabled" },
      });
      return Response.json({
        choices: [{
          finish_reason: "stop",
          message: { content: "ok", reasoning_content: "hidden reasoning" },
        }],
      });
    }, async () => {
      assert.equal((await deepSeekAiProvider.generateText(
        textRequest({ thinkingEnabled: true, timeoutMs: 30_000 }),
        context(),
      )).text, "ok");
    });
  });

  it("uses JSON mode with a schema instruction and parses the result", async () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    };
    await withFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
        response_format: unknown;
      };
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.messages[0]?.role, "system");
      assert.match(body.messages[0]?.content ?? "", /валидный JSON/);
      assert.match(body.messages[0]?.content ?? "", /"required":\["title"\]/);
      assert.deepEqual(body.messages.slice(1), textRequest().messages);
      return Response.json({
        choices: [{
          finish_reason: "stop",
          message: { content: "{\"title\":\"Dune\"}" },
        }],
      });
    }, async () => {
      assert.deepEqual(await deepSeekAiProvider.generateObject(
        { ...textRequest(), schema },
        context(),
      ), {
        value: { title: "Dune" },
        modelId: "deepseek-v4-flash",
        usage: undefined,
        providerRequestId: undefined,
      });
    });
  });

  it("rejects invalid JSON and malformed or incomplete responses", async () => {
    const payloads = [
      { choices: [{ finish_reason: "stop", message: { content: "not-json" } }] },
      { choices: [] },
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      { choices: [{ finish_reason: "content_filter", message: { content: "{}" } }] },
    ];
    for (const payload of payloads) {
      await withFetch(async () => Response.json(payload), async () => {
        await assert.rejects(
          deepSeekAiProvider.generateObject(
            { ...textRequest(), schema: { type: "object" } },
            context(),
          ),
          assertAiError("invalid-response"),
        );
      });
    }
  });

  it("classifies documented HTTP errors without leaking provider payloads", async () => {
    for (const [status, code] of [
      [400, "configuration"],
      [401, "authentication"],
      [402, "configuration"],
      [422, "configuration"],
      [429, "rate-limit"],
      [500, "provider-unavailable"],
      [503, "provider-unavailable"],
      [504, "timeout"],
    ] as const) {
      await withFetch(async () => Response.json(
        { error: { message: `provider says ${apiKey}` } },
        { status },
      ), async () => {
        await assert.rejects(
          deepSeekAiProvider.generateText(textRequest(), context()),
          assertAiError(code),
        );
      });
    }
  });

  it("retries one transient network or provider failure", async () => {
    for (const firstFailure of ["network", "http"] as const) {
      let calls = 0;
      await withFetch(async () => {
        calls += 1;
        if (calls === 1) {
          if (firstFailure === "network") throw new TypeError("network unavailable");
          return Response.json({ error: { message: apiKey } }, { status: 503 });
        }
        return Response.json({
          choices: [{ finish_reason: "stop", message: { content: "ok" } }],
        });
      }, async () => {
        assert.equal(
          (await deepSeekAiProvider.generateText(textRequest(), context())).text,
          "ok",
        );
      });
      assert.equal(calls, 2);
    }
  });

  it("does not retry an aborted request", async () => {
    const controller = new AbortController();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      controller.abort();
      throw abortError;
    }, async () => {
      await assert.rejects(
        deepSeekAiProvider.generateText(textRequest(), context(controller.signal)),
        (error: unknown) => error === abortError,
      );
    });
    assert.equal(calls, 1);
  });
});
