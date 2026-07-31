import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";

import { createAiProviderRegistry } from "@/lib/ai/registry";
import {
  COMMON_AI_SETTING_FIELDS,
  getAiProviderSettingFields,
  parseAiCredentials,
  parseAiParameters,
  readAiFieldsFromForm,
  readSparseAiFieldsFromForm,
} from "@/lib/ai/schema";
import { createInMemoryAiAdapter } from "@/lib/ai/testing/in-memory-adapter";
import { AiError, type AiFieldDefinition } from "@/lib/ai/types";
import {
  AI_SCENARIO_KEYS,
  getAiScenarioDefinition,
  parseSuggestSeriesConfig,
} from "@/lib/ai/scenarios/catalog";
import {
  appendUniqueFranchiseIds,
  resolveSuggestedFranchises,
} from "@/lib/ai/scenarios/suggest-franchises-client";

const root = process.cwd();

describe("AI provider registry", () => {
  it("returns registered adapters and rejects unknown providers", () => {
    const adapter = createInMemoryAiAdapter();
    const registry = createAiProviderRegistry([adapter]);

    assert.deepEqual(registry.list(), [adapter]);
    assert.equal(registry.get("in-memory"), adapter);
    assert.throws(
      () => registry.get("missing"),
      (error) => error instanceof AiError && error.code === "configuration",
    );
  });

  it("rejects duplicate and empty provider codes", () => {
    assert.throws(
      () => createAiProviderRegistry([
        createInMemoryAiAdapter(),
        createInMemoryAiAdapter({ label: "Duplicate" }),
      ]),
      /Duplicate or empty AI provider code/,
    );
    assert.throws(
      () => createAiProviderRegistry([createInMemoryAiAdapter({ code: " " })]),
      /Duplicate or empty AI provider code/,
    );
  });
});

describe("AI scenario catalog", () => {
  it("exposes the fixed suggest-series contract and validates its config", () => {
    assert.equal(AI_SCENARIO_KEYS.SUGGEST_SERIES, "suggest_series");
    assert.equal(getAiScenarioDefinition("suggest_series")?.name, "Предложить серии");
    assert.deepEqual(parseSuggestSeriesConfig({}), { resultLimit: 3 });
    assert.deepEqual(parseSuggestSeriesConfig({ resultLimit: 1 }), { resultLimit: 1 });
    assert.deepEqual(parseSuggestSeriesConfig({ resultLimit: 10 }), { resultLimit: 10 });
    assert.throws(() => parseSuggestSeriesConfig({ resultLimit: 0 }));
    assert.throws(() => parseSuggestSeriesConfig({ resultLimit: 11 }));
    assert.throws(() => parseSuggestSeriesConfig({ resultLimit: 2.5 }));
    assert.throws(() => parseSuggestSeriesConfig({ resultLimit: "3" }));
    assert.deepEqual(parseSuggestSeriesConfig(null), { resultLimit: 3 });
    assert.equal(getAiScenarioDefinition("legacy"), null);
  });

  it("resolves and appends suggested series without unknown or duplicate IDs", () => {
    const options = [
      { id: 1, title: "One" },
      { id: 2, title: "Two" },
      { id: 3, title: "Three" },
    ];

    assert.deepEqual(
      resolveSuggestedFranchises(options, ["2"], [3, 999, 3, 1, 2]),
      [options[0], options[2]],
    );
    assert.deepEqual(appendUniqueFranchiseIds(["2", "1"], [1, 3, 3]), ["2", "1", "3"]);
  });
});

describe("AI provider field schemas", () => {
  const fields = [
    { key: "temperature", label: "Temperature", type: "number", min: 0, max: 2 },
    { key: "timeoutMs", label: "Timeout", type: "number", defaultValue: 30_000,
      min: 1_000, max: 300_000 },
    { key: "debug", label: "Debug", type: "boolean", defaultValue: false },
  ] as const satisfies readonly AiFieldDefinition[];

  it("applies defaults and converts numeric form values", () => {
    assert.deepEqual(
      parseAiParameters({ temperature: "0.7" }, fields, { applyDefaults: true }),
      { temperature: 0.7, timeoutMs: 30_000, debug: false },
    );
    assert.equal(
      parseAiParameters({}, COMMON_AI_SETTING_FIELDS, { applyDefaults: true }).timeoutMs,
      30_000,
    );
  });

  it("rejects unknown options, invalid booleans, and out-of-range numbers", () => {
    for (const value of [
      { unknown: "value" },
      { debug: "true" },
      { temperature: -0.01 },
      { temperature: 2.01 },
      { timeoutMs: 999 },
      { timeoutMs: 300_001 },
    ]) {
      assert.throws(
        () => parseAiParameters(value, fields),
        (error) => error instanceof AiError && error.code === "configuration",
      );
    }
  });

  it("validates numeric steps without rejecting decimal precision noise", () => {
    const steppedFields = [
      { key: "temperature", label: "Temperature", type: "number", min: 0, step: 0.1 },
    ] as const satisfies readonly AiFieldDefinition[];

    assert.deepEqual(parseAiParameters({ temperature: 0.1 + 0.2 }, steppedFields), {
      temperature: 0.1 + 0.2,
    });
    assert.throws(() => parseAiParameters({ temperature: 0.15 }, steppedFields), AiError);
  });

  it("allows required settings to be omitted from sparse override layers", () => {
    const requiredFields = [
      { key: "mode", label: "Mode", type: "string", required: true },
    ] as const satisfies readonly AiFieldDefinition[];

    assert.deepEqual(
      parseAiParameters({}, requiredFields, { allowMissingRequired: true }),
      {},
    );
    assert.throws(() => parseAiParameters({}, requiredFields), AiError);
  });

  it("requires declared credentials, trims them, and rejects extra secrets", () => {
    const credentialFields = [
      { key: "token", label: "Token", type: "secret", required: true },
    ] as const satisfies readonly AiFieldDefinition[];

    assert.deepEqual(parseAiCredentials({ token: "  secret  " }, credentialFields), {
      token: "secret",
    });
    assert.throws(() => parseAiCredentials({}, credentialFields), AiError);
    assert.throws(
      () => parseAiCredentials({ token: "secret", endpoint: "unknown" }, credentialFields),
      AiError,
    );
  });

  it("combines common and provider-specific fields and reads unchecked booleans", () => {
    const providerFields = [
      { key: "reasoning", label: "Reasoning", type: "boolean", defaultValue: true },
    ] as const satisfies readonly AiFieldDefinition[];
    const fields = getAiProviderSettingFields(providerFields);
    const formData = new FormData();
    formData.set("setting.temperature", "0.4");

    assert.deepEqual(fields.map((field) => field.key), [
      "temperature", "maxOutputTokens", "timeoutMs", "reasoning",
    ]);
    assert.deepEqual(readAiFieldsFromForm(formData, "setting.", fields), {
      temperature: "0.4",
      reasoning: false,
    });
    assert.throws(
      () => getAiProviderSettingFields([
        { key: "temperature", label: "Duplicate", type: "number" },
      ]),
      /Duplicate AI setting field/,
    );
  });

  it("reads sparse scenario overrides without losing explicit zero and false", () => {
    const fields = [
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "reasoning", label: "Reasoning", type: "boolean" },
      { key: "optional", label: "Optional", type: "string" },
    ] as const satisfies readonly AiFieldDefinition[];
    const formData = new FormData();
    formData.set("parameter.temperature", "0");
    formData.set("parameter.reasoning", "0");
    formData.set("parameter.optional", "");

    assert.deepEqual(readSparseAiFieldsFromForm(formData, "parameter.", fields), {
      temperature: "0",
      reasoning: false,
    });
    formData.set("parameter.reasoning", "");
    assert.deepEqual(readSparseAiFieldsFromForm(formData, "parameter.", fields), {
      temperature: "0",
    });
  });
});

describe("in-memory AI adapter", () => {
  const context = {
    credentials: { token: "test" },
    signal: new AbortController().signal,
  };

  it("supports model discovery, credential validation, text, and object generation", async () => {
    const adapter = createInMemoryAiAdapter();
    const request = {
      messages: [{ role: "user" as const, content: "Последнее сообщение" }],
      modelId: "test-model",
      parameters: {},
    };

    assert.deepEqual(await adapter.listModels?.(context), [
      { id: "test-model", label: "Test model" },
    ]);
    await adapter.validateCredentials(context);
    assert.deepEqual(await adapter.generateText(request, context), {
      text: "Последнее сообщение",
      modelId: "test-model",
    });
    assert.deepEqual(
      await adapter.generateObject({ ...request, schema: { type: "object" } }, context),
      { value: { text: "Последнее сообщение" }, modelId: "test-model" },
    );
  });

  it("allows tests to model typed provider failures", async () => {
    for (const code of ["authentication", "rate-limit", "provider-unavailable"] as const) {
      const adapter = createInMemoryAiAdapter({
        async generateText() {
          throw new AiError(code, code);
        },
      });

      await assert.rejects(
        adapter.generateText({ messages: [], modelId: "test-model", parameters: {} }, context),
        (error) => error instanceof AiError && error.code === code,
      );
    }
  });
});

describe("AI persistence and UI security contracts", () => {
  it("keeps credentials out of the admin query result and password input values", async () => {
    const query = await readFile(path.join(root, "src/db/queries/ai-providers.ts"), "utf8");
    const form = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/provider-form.tsx",
    ), "utf8");

    const adminStateQuery = query.slice(
      query.indexOf("export async function getAiProviderAdminState"),
      query.indexOf("export async function getAiProviderRuntimeConfig"),
    );
    assert.doesNotMatch(adminStateQuery, /encryptedPayload/);
    assert.match(form, /type="password"/);
    assert.doesNotMatch(form, /defaultValue=.*credential/i);
  });

  it("stores only technical call metadata and defines the required indexes", async () => {
    const migration = await readFile(path.join(root, "drizzle/0045_ai_providers.sql"), "utf8");
    const logQuery = await readFile(path.join(root, "src/db/queries/ai-call-logs.ts"), "utf8");

    assert.doesNotMatch(migration, /prompt|messages|response_payload|output_text/i);
    assert.doesNotMatch(logQuery, /messages|prompt|response|result/);
    assert.match(migration, /CREATE UNIQUE INDEX "ai_scenario_profiles_key_unique"/);
    assert.match(migration, /"profile_key","created_at"/);
    assert.match(migration, /"status","created_at"/);
  });

  it("makes the scenario model override nullable without rewriting existing values", async () => {
    const migration = await readFile(
      path.join(root, "drizzle/0046_ai_scenario_inheritance.sql"),
      "utf8",
    );
    assert.match(migration, /DROP CONSTRAINT "ai_scenario_profiles_model_id_check"/);
    assert.match(migration, /ALTER COLUMN "model_id" DROP NOT NULL/);
    assert.doesNotMatch(migration, /UPDATE|DEFAULT/i);
  });

  it("uses a dedicated AES-256-GCM key and never exposes decrypted credentials to UI", async () => {
    const crypto = await readFile(path.join(root, "src/lib/ai/credential-crypto.ts"), "utf8");
    const providersPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/page.tsx",
    ), "utf8");

    assert.match(crypto, /AI_PROVIDER_CREDENTIALS_KEY/);
    assert.match(crypto, /aes-256-gcm/);
    assert.match(crypto, /getAuthTag/);
    assert.match(crypto, /setAuthTag/);
    assert.doesNotMatch(providersPage, /encryptedPayload|decryptAiCredentials/);
  });

  it("saves provider areas independently and keeps each activity log atomic", async () => {
    const query = await readFile(path.join(root, "src/db/queries/ai-providers.ts"), "utf8");
    const actions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/actions.ts",
    ), "utf8");
    const credentialsSave = query.slice(
      query.indexOf("export async function saveAiProviderCredentials"),
      query.indexOf("export async function saveAiProviderSettings"),
    );
    const settingsSave = query.slice(
      query.indexOf("export async function saveAiProviderSettings"),
      query.indexOf("export async function setAiProviderEnabled"),
    );
    const settingsLock = query.slice(
      query.indexOf("export async function lockAiProviderSettings"),
      query.indexOf("export async function getAiProviderAdminState"),
    );
    const toggleSave = query.slice(query.indexOf("export async function setAiProviderEnabled"));

    for (const operation of [credentialsSave, settingsSave, toggleSave]) {
      assert.match(operation, /db\.transaction/);
      assert.match(operation, /adminActivityLogs/);
    }
    assert.match(credentialsSave, /aiProviderCredentials/);
    assert.doesNotMatch(credentialsSave, /aiProviderSettings/);
    assert.match(settingsSave, /aiProviderSettings/);
    assert.doesNotMatch(settingsSave, /aiProviderCredentials/);
    assert.doesNotMatch(settingsSave, /enabled: input\.enabled/);
    assert.match(settingsSave, /const defaultModelId = input\.defaultModelId\?\.trim\(\) \|\| null/);
    assert.match(settingsSave, /eq\(aiScenarioProfiles\.providerCode, input\.providerCode\)/);
    assert.match(settingsSave, /eq\(aiScenarioProfiles\.enabled, true\)/);
    assert.match(settingsSave, /isNull\(aiScenarioProfiles\.modelId\)/);
    assert.match(settingsSave, /AI_PROVIDER_DEFAULT_MODEL_REQUIRED/);
    assert.match(settingsSave, /defaultModelId,/);
    assert.match(settingsLock, /tx\.execute\(sql`[\s\S]*select 1[\s\S]*for update/);
    assert.match(settingsLock, /from \$\{aiProviderSettings\}/);
    assert.match(
      settingsLock,
      /where \$\{aiProviderSettings\.providerCode\} = \$\{providerCode\}/,
    );
    assert.ok(
      settingsSave.indexOf("await lockAiProviderSettings(tx, input.providerCode)") <
        settingsSave.indexOf("const defaultModelId"),
    );
    assert.ok(
      settingsSave.indexOf("await lockAiProviderSettings(tx, input.providerCode)") <
        settingsSave.indexOf("const [dependentScenario]"),
    );
    assert.match(toggleSave, /aiProviderSettings/);
    assert.doesNotMatch(toggleSave, /defaultModelId|encryptedPayload/);
    assert.match(actions, /saveAiProviderCredentials/);
    assert.match(actions, /saveAiProviderSettings/);
    assert.match(actions, /setAiProviderEnabled/);
    assert.doesNotMatch(actions, /saveAiProviderConfiguration/);
    assert.match(actions, /error\.message === "AI_PROVIDER_DEFAULT_MODEL_REQUIRED"/);
    assert.match(
      actions,
      /Нельзя убрать модель по умолчанию: её используют включённые сценарии\./,
    );
  });

  it("keeps credentials, settings, and enable toggle as separate provider controls", async () => {
    const form = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/provider-form.tsx",
    ), "utf8");
    const actions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/actions.ts",
    ), "utf8");

    assert.match(form, /setCredentialProvider\(adapter\)/);
    assert.match(form, /setSettingsProvider\(adapter\)/);
    assert.match(form, /toggleAiProviderAction\(adapter\.code, enabled\)/);
    assert.match(form, /<CredentialsModal/);
    assert.match(form, /<SettingsModal/);
    assert.match(form, /<AdminToasts messages=\{getActionToasts\(message, "provider-list"\)\}/);
    assert.match(form, /<AdminToasts messages=\{getActionToasts\(state, "credentials"\)\}/);
    assert.match(form, /<AdminToasts messages=\{getActionToasts\(state, "settings"\)\}/);
    assert.doesNotMatch(form, /ModalMessage|<p role="(?:alert|status)"/);
    assert.match(form, /role="dialog"/);
    assert.match(form, /aria-modal="true"/);
    assert.match(form, /disabled=\{providerPending \|\| \(!state\.enabled && !state\.hasCredentials\)\}/);
    assert.match(actions, /if \(enabled && !current\.credentials\)/);
    assert.match(actions, /Сначала настройте авторизацию/);
  });

  it("authenticates model discovery and preserves manual model ID fallback", async () => {
    const actions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/actions.ts",
    ), "utf8");
    const form = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/provider-form.tsx",
    ), "utf8");
    const listModels = actions.slice(actions.indexOf("export async function listAiModelsAction"));

    assert.match(listModels, /await requireAdminUser\(\)/);
    assert.match(listModels, /decryptAiCredentials/);
    assert.match(listModels, /adapter\.listModels/);
    assert.match(listModels, /\{ id, label, isFree \}/);
    assert.match(listModels, /Model ID можно ввести вручную/);
    assert.doesNotMatch(form, /<datalist/);
    assert.match(form, /aria-label="Каталог моделей"/);
    assert.match(form, /name="defaultModelId"/);
    assert.match(form, /Фильтр моделей по стоимости/);
    assert.match(form, /<option value="all">Все модели<\/option>/);
    assert.match(form, /Только платные/);
    assert.match(form, /Только бесплатные/);
    assert.match(form, /modelFilter === "all" \|\|/);
    assert.match(form, /modelFilter === "free" \? model\.isFree === true/);
    assert.match(form, /: model\.isFree === false/);
    assert.match(form, /useState\(settings\?\.defaultModelId \?\? ""\)/);
    assert.match(form, /value=\{modelId\}/);
    assert.match(form, /onChange=\{\(event\) => setModelId\(event\.currentTarget\.value\)\}/);
    assert.match(form, /models\.length > 0/);
    assert.match(form, /onChange=\{\(event\) =>\s+setModelFilter/);
    assert.match(form, /Идентификатор модели всегда можно ввести вручную/);
  });

  it("runs a provider model smoke test from saved server-side configuration", async () => {
    const actions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/actions.ts",
    ), "utf8");
    const form = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/providers/provider-form.tsx",
    ), "utf8");
    const smokeAction = actions.slice(
      actions.indexOf("export async function smokeTestAiProviderModelAction"),
    );
    const smokeLogger = smokeAction.slice(smokeAction.indexOf("async function writeSmokeTestLog"));
    const smokeButton = form.slice(
      form.indexOf("aria-label={`Проверить модель"),
      form.indexOf("<MessageSquareText", form.indexOf("aria-label={`Проверить модель")),
    );
    const smokeModal = form.slice(
      form.indexOf("function SmokeTestModal"),
      form.indexOf("function ModalFrame"),
    );
    const modalFrame = form.slice(form.indexOf("function ModalFrame"));

    assert.match(form, /aria-label={`Проверить модель \$\{adapter\.label\}`}/);
    assert.match(smokeButton, /!state\.hasCredentials \|\| !state\.defaultModelId/);
    assert.doesNotMatch(smokeButton, /state\.enabled/);
    assert.match(form, /setCredentialProvider\(null\)/);
    assert.match(form, /setSettingsProvider\(null\)/);
    assert.match(form, /<SmokeTestModal/);
    assert.match(smokeModal, /description="Отправляет один ручной запрос/);
    assert.match(smokeModal, /closeDisabled=\{isPending\}/);
    assert.match(smokeModal, /maxLength=\{8_000\}/);
    assert.match(smokeModal, /prompt\.trim\(\)/);
    assert.match(smokeModal, /setState\(initialActionState\)/);
    assert.match(smokeModal, /setResponse\(null\)/);
    assert.match(smokeModal, /disabled=\{!canSubmit\}/);
    assert.match(smokeModal, /Отправляем…/);
    assert.match(
      smokeModal,
      /smokeTestAiProviderModelAction\(provider\.code, prompt\)/,
    );
    assert.doesNotMatch(smokeModal, /modelId|credentials|parameters/);
    assert.match(smokeModal, /setState\(\{ error: result\.error, success: null \}\)/);
    assert.match(smokeModal, /setResponse\(result\.text\)/);
    assert.match(smokeModal, /whitespace-pre-wrap/);
    assert.match(smokeModal, /<AdminToasts messages=\{getActionToasts\(state, "smoke-test"\)\}/);
    assert.match(smokeAction, /await requireAdminUser\(\)/);
    assert.match(
      smokeAction,
      /typeof providerCode !== "string" \|\| typeof prompt !== "string"/,
    );
    assert.match(actions, /MAX_SMOKE_TEST_PROMPT_LENGTH = 8_000/);
    assert.match(actions, /MAX_SMOKE_TEST_RESPONSE_LENGTH = 20_000/);
    assert.match(actions, /MAX_SMOKE_TEST_OUTPUT_TOKENS = 1_024/);
    assert.match(smokeAction, /safePrompt\.length > MAX_SMOKE_TEST_PROMPT_LENGTH/);
    assert.match(smokeAction, /getAiProviderRuntimeConfig\(safeProviderCode\)/);
    assert.match(smokeAction, /current\.settings\?\.defaultModelId/);
    assert.match(smokeAction, /decryptAiCredentials/);
    assert.match(smokeAction, /parseAiParameters\(current\.settings\.settings/);
    assert.match(
      smokeAction,
      /maxOutputTokens: Math\.min\([\s\S]*MAX_SMOKE_TEST_OUTPUT_TOKENS[\s\S]*MAX_SMOKE_TEST_OUTPUT_TOKENS/,
    );
    assert.match(smokeAction, /adapter\.generateText/);
    assert.match(smokeAction, /runAiWithTimeout/);
    assert.doesNotMatch(smokeAction, /settings\?\.enabled/);
    assert.match(smokeAction, /normalizeAiError\(error\)/);
    assert.match(smokeAction, /getSmokeTestErrorMessage\(normalized\.code\)/);
    assert.match(smokeAction, /result\.text\.slice\(0, MAX_SMOKE_TEST_RESPONSE_LENGTH\)/);
    assert.match(smokeLogger, /scenarioProfileId: null/);
    assert.match(smokeLogger, /PROVIDER_SMOKE_TEST_PROFILE_KEY/);
    assert.match(smokeLogger, /try \{[\s\S]*await createAiCallLog/);
    assert.match(smokeLogger, /catch \(error\) \{[\s\S]*console\.error/);
    assert.doesNotMatch(smokeLogger, /prompt|messages|result\.text|response/i);
    assert.match(modalFrame, /disabled=\{closeDisabled\}[\s\S]*onClick=\{onClose\}/);
    assert.match(modalFrame, /if \(!closeDisabledRef\.current\) onCloseRef\.current\(\)/);
  });

  it("renders dynamic common/provider fields and boolean controls for scenarios", async () => {
    const newPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/new/page.tsx",
    ), "utf8");
    const form = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/scenario-form.tsx",
    ), "utf8");

    assert.match(newPage, /getAiProviderSettingFields\(settingFields\)/);
    assert.match(form, /provider\.settingFields\.map/);
    assert.match(form, /field\.type === "boolean"/);
    assert.match(form, /field\.step \?\? "any"/);
    assert.match(form, /name={`parameter\.\$\{field\.key\}`}/);
    assert.match(form, /setProviderCode/);
    assert.match(form, /setParameters\(\{\}\)/);
  });

  it("separates scenario list, create, and edit data flows", async () => {
    const query = await readFile(path.join(root, "src/db/queries/ai-scenarios.ts"), "utf8");
    const actions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/actions.ts",
    ), "utf8");
    const listPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/page.tsx",
    ), "utf8");
    const editPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/[id]/edit/page.tsx",
    ), "utf8");
    const newPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/new/page.tsx",
    ), "utf8");
    const scenarioForm = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/scenario-form.tsx",
    ), "utf8");
    const providerQuery = await readFile(path.join(
      root,
      "src/db/queries/ai-providers.ts",
    ), "utf8");
    const listQuery = query.slice(
      query.indexOf("export async function getAiScenarioProfiles"),
      query.indexOf("export async function getAiScenarioProfileById"),
    );
    const byIdQuery = query.slice(
      query.indexOf("export async function getAiScenarioProfileById"),
      query.indexOf("export async function getEnabledAiScenarioProfile"),
    );
    const createAction = actions.slice(
      actions.indexOf("export async function createAiScenarioAction"),
      actions.indexOf("export async function updateAiScenarioAction"),
    );
    const updateAction = actions.slice(
      actions.indexOf("export async function updateAiScenarioAction"),
      actions.indexOf("function scenarioMetadata"),
    );

    assert.doesNotMatch(listQuery, /parameters:/);
    for (const field of ["id", "key", "name", "providerCode", "modelId", "enabled", "updatedAt"]) {
      assert.match(listQuery, new RegExp(`${field}: aiScenarioProfiles\\.`));
    }
    assert.match(byIdQuery, /where\(eq\(aiScenarioProfiles\.id, id\)\)\.limit\(1\)/);
    assert.match(byIdQuery, /return profile \?\? null/);
    assert.match(query, /getAiScenarioProfileById/);
    assert.match(query, /createAiScenarioProfile/);
    assert.match(query, /updateAiScenarioProfile/);
    assert.doesNotMatch(createAction, /read\(formData, "id"\)/);
    assert.doesNotMatch(createAction, /\bid,\s*adminId/);
    assert.match(updateAction, /const id = Number\(read\(formData, "id"\)\)/);
    assert.match(updateAction, /!Number\.isInteger\(id\) \|\| id <= 0/);
    assert.match(updateAction, /scenarios\?error=not-found/);
    assert.match(updateAction, /scenarios\/\$\{id\}\/edit\?error=invalid/);
    assert.match(updateAction, /scenarios\/\$\{id\}\/edit\?updated=1/);
    assert.match(actions, /ai-scenario\.created/);
    assert.match(actions, /ai-scenario\.updated/);
    assert.match(editPage, /if \(!Number\.isInteger\(id\) \|\| id <= 0\) notFound\(\)/);
    assert.match(editPage, /if \(!profile\) notFound\(\)/);
    assert.match(listPage, /\/admin\/tools\/ai\/scenarios\/new/);
    assert.match(listPage, /href=\{`\/admin\/tools\/ai\/scenarios\/\$\{profile\.id\}\/edit`\}/);
    assert.match(listPage, /profile\.enabled \? "Включён" : "Выключен"/);
    assert.match(listPage, /providerLabels\.get\(profile\.providerCode\) \?\? profile\.providerCode/);
    assert.match(listPage, /<AdminToasts clearParams=\{\["created", "deleted", "error"\]\}/);
    assert.match(newPage, /<AdminToasts clearParams=\{\["error"\]\}/);
    assert.match(editPage, /<AdminToasts clearParams=\{\["error", "updated"\]\}/);
    assert.match(editPage, /legacy: true/);
    assert.match(editPage, /if \(!providers\.some\(\(\{ code \}\) => code === profile\.providerCode\)\)/);
    assert.match(editPage, /getAiScenarioProfileById/);
    assert.match(scenarioForm, /item\.legacy \? " \(недоступен\)" : ""/);
    assert.match(scenarioForm, /disabled=\{provider\.legacy \|\| hasFieldErrors\}/);
    assert.match(scenarioForm, /setProviderCode\(event\.currentTarget\.value\)/);
    assert.match(scenarioForm, /setParameters\(\{\}\)/);
    assert.match(scenarioForm, /setModelId\(""\)/);
    assert.match(scenarioForm, /name="scenarioKey"/);
    assert.match(scenarioForm, /catalogEntries\.map/);
    assert.match(actions, /getAiScenarioDefinition\(read\(formData, "scenarioKey"\)\)/);
    assert.match(scenarioForm, /noValidate/);
    assert.match(scenarioForm, /validateScenarioForm\(new FormData\(event\.currentTarget\), provider\)/);
    assert.match(scenarioForm, /event\.preventDefault\(\)/);
    assert.match(
      scenarioForm,
      /Object\.keys\(errors\)\.some\(\(key\) => key\.startsWith\("parameter\."\)\)[\s\S]*setDetailsOpen\(true\)/,
    );
    assert.match(
      scenarioForm,
      /aria-invalid=\{Boolean\(fieldErrors\[`parameter\.\$\{field\.key\}`\]\)\}/,
    );
    assert.match(scenarioForm, /scenario-parameter-\$\{field\.key\}-error/);
    assert.match(scenarioForm, /role="alert"/);
    assert.match(scenarioForm, /border-red-400/);
    assert.match(scenarioForm, /disabled=\{provider\.legacy \|\| hasFieldErrors\}/);
    assert.match(scenarioForm, /validateScenarioParameter/);
    assert.match(scenarioForm, /field\.min !== undefined && number < field\.min/);
    assert.match(scenarioForm, /field\.max !== undefined && number > field\.max/);
    assert.match(scenarioForm, /typeof field\.step === "number"/);
    assert.match(scenarioForm, /if \(!value\.trim\(\) \|\| field\.type !== "number"\) return null/);
    assert.match(scenarioForm, /const number = Number\(value\)/);
    assert.match(scenarioForm, /if \(field\.type === "boolean"\) continue/);
    assert.match(scenarioForm, /<summary[^>]*>\s*Дополнительно/);
    assert.match(
      scenarioForm,
      /profile\?\.modelId \|\| profile\?\.instruction \|\|/,
    );
    assert.match(scenarioForm, /useState\(hasExistingOverrides\)/);
    assert.match(scenarioForm, /open=\{detailsOpen\}/);
    assert.match(scenarioForm, /onToggle=\{\(event\) => setDetailsOpen\(event\.currentTarget\.open\)\}/);
    assert.doesNotMatch(scenarioForm, /name="modelId"[\s\S]{0,160}\brequired\b/);
    assert.match(scenarioForm, /<option value="">Из настроек провайдера<\/option>/);
    assert.match(scenarioForm, /<option value="1">Да<\/option>/);
    assert.match(scenarioForm, /<option value="0">Нет<\/option>/);
    assert.match(
      scenarioForm,
      /if \(event\.currentTarget\.value === ""\) delete next\[field\.key\]/,
    );
    assert.match(
      scenarioForm,
      /const value = event\.currentTarget\.value;[\s\S]*setParameters\(\(current\) => \(\{ \.\.\.current, \[field\.key\]: value \}\)\)[\s\S]*updateFieldError/,
    );
    assert.match(
      scenarioForm,
      /if \(error\) next\[key\] = error;\s*else delete next\[key\];\s*return next/,
    );
    assert.doesNotMatch(
      scenarioForm.slice(scenarioForm.indexOf("function updateFieldError")),
      /setParameters|setModelId/,
    );
    assert.match(actions, /read\(formData, "modelId"\) \|\| null/);
    assert.match(actions, /readSparseAiFieldsFromForm\(formData, "parameter\.", fields\)/);
    assert.match(actions, /parseAiParameters\([\s\S]*readSparseAiFieldsFromForm/);
    assert.match(actions, /parseSuggestSeriesConfig/);
    assert.match(scenarioForm, /name="instruction"/);
    assert.match(scenarioForm, /Сбросить к системной/);
    assert.match(scenarioForm, /name="resultLimit"/);
    assert.match(scenarioForm, /validateResultLimit/);
    assert.match(listPage, /<ConfirmAction/);
    assert.match(actions, /deleteAiScenarioAction/);
    assert.match(listPage, /profile\.modelId \?\? "Из настроек провайдера"/);
    const scenarioDefaultsQuery = providerQuery.slice(
      providerQuery.indexOf("export async function getAiProviderScenarioDefaults"),
      providerQuery.indexOf("export async function getAiProviderRuntimeConfig"),
    );
    assert.match(scenarioDefaultsQuery, /defaultModelId: aiProviderSettings\.defaultModelId/);
    assert.match(scenarioDefaultsQuery, /settings: aiProviderSettings\.settings/);
    assert.doesNotMatch(scenarioDefaultsQuery, /aiProviderCredentials|encryptedPayload|keyHint/);
    assert.match(newPage, /getAiProviderScenarioDefaults\(\)/);
    assert.match(editPage, /getAiProviderScenarioDefaults\(\)/);
    assert.match(editPage, /defaultModelId: null/);
    assert.match(editPage, /settings: \{\}/);
  });

  it("requires a ready provider before enabling a scenario", async () => {
    const query = await readFile(path.join(root, "src/db/queries/ai-scenarios.ts"), "utf8");
    const readiness = query.slice(
      query.indexOf("async function assertProviderReadyForEnabledScenario"),
      query.indexOf("export async function createAiScenarioProfile"),
    );
    const create = query.slice(
      query.indexOf("export async function createAiScenarioProfile"),
      query.indexOf("export async function updateAiScenarioProfile"),
    );
    const update = query.slice(query.indexOf("export async function updateAiScenarioProfile"));

    assert.match(readiness, /if \(!input\.enabled\) return/);
    assert.match(readiness, /await lockAiProviderSettings\(tx, input\.providerCode\)/);
    assert.match(readiness, /aiProviderSettings\.enabled/);
    assert.match(readiness, /aiProviderCredentials\.providerCode/);
    assert.match(
      readiness,
      /input\.modelId\?\.trim\(\) \|\| provider\?\.defaultModelId\?\.trim\(\) \|\| null/,
    );
    assert.match(readiness, /!provider\?\.enabled \|\| !credentials \|\| !effectiveModelId/);
    assert.match(readiness, /AI_SCENARIO_PROVIDER_NOT_READY/);
    assert.ok(
      readiness.indexOf("await lockAiProviderSettings(tx, input.providerCode)") <
        readiness.indexOf("const [provider]"),
    );
    assert.ok(
      readiness.indexOf("const [provider]") <
        readiness.indexOf("const [credentials]"),
    );
    assert.match(create, /const modelId = input\.modelId\?\.trim\(\) \|\| null/);
    assert.match(create, /assertProviderReadyForEnabledScenario\(tx, \{ \.\.\.input, modelId \}\)/);
    assert.match(create, /modelId,\s+instruction: input\.instruction,\s+parameters: input\.parameters/);
    assert.match(update, /const modelId = input\.modelId\?\.trim\(\) \|\| null/);
    assert.match(update, /assertProviderReadyForEnabledScenario\(tx, \{ \.\.\.input, modelId \}\)/);
    assert.match(update, /modelId,\s+instruction: input\.instruction,\s+parameters: input\.parameters/);
    assert.match(update, /\.returning\(\{ id: aiScenarioProfiles\.id \}\)/);
    assert.match(update, /if \(!updated\) throw new Error\("AI_SCENARIO_NOT_FOUND"\)/);
  });

  it("keeps suggest-series domain, API, media form, and persistence contracts bounded", async () => {
    const operation = await readFile(path.join(
      root,
      "src/lib/ai/scenarios/suggest-franchises.ts",
    ), "utf8");
    const route = await readFile(path.join(
      root,
      "src/app/api/media/suggest-franchises/route.ts",
    ), "utf8");
    const mediaForm = await readFile(path.join(
      root,
      "src/app/admin/(protected)/media/media-form.tsx",
    ), "utf8");
    const authorMediaForm = await readFile(path.join(
      root,
      "src/app/author/(protected)/media/media-item-form.tsx",
    ), "utf8");
    const adminMediaNewPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/media/new/page.tsx",
    ), "utf8");
    const adminMediaEditPage = await readFile(path.join(
      root,
      "src/app/admin/(protected)/media/[id]/edit/page.tsx",
    ), "utf8");
    const authorMediaNewPage = await readFile(path.join(
      root,
      "src/app/author/(protected)/media/new/page.tsx",
    ), "utf8");
    const authorMediaEditPage = await readFile(path.join(
      root,
      "src/app/author/(protected)/media/[id]/edit/page.tsx",
    ), "utf8");
    const archiveMediaSuggestion = await readFile(path.join(
      root,
      "src/app/archive-author-media-suggestion.tsx",
    ), "utf8");
    const archivePage = await readFile(path.join(root, "src/app/page.tsx"), "utf8");
    const mediaItemPage = await readFile(path.join(
      root,
      "src/app/media/[code]/page.tsx",
    ), "utf8");
    const franchiseSuggestionDialog = await readFile(path.join(
      root,
      "src/app/media-item-franchise-suggestion-dialog.tsx",
    ), "utf8");
    const seriesPage = await readFile(path.join(
      root,
      "src/app/series/[code]/page.tsx",
    ), "utf8");
    const clientHelper = await readFile(path.join(
      root,
      "src/lib/ai/scenarios/suggest-franchises-client.ts",
    ), "utf8");
    const franchiseQuery = await readFile(path.join(
      root,
      "src/db/queries/franchises.ts",
    ), "utf8");
    const authorAiRateLimit = await readFile(path.join(
      root,
      "src/lib/ai/rate-limits.ts",
    ), "utf8");
    const scenarioActions = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/actions.ts",
    ), "utf8");
    const scenarioList = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/page.tsx",
    ), "utf8");
    const scenarioNew = await readFile(path.join(
      root,
      "src/app/admin/(protected)/tools/ai/scenarios/new/page.tsx",
    ), "utf8");
    const scenarioQuery = await readFile(path.join(
      root,
      "src/db/queries/ai-scenarios.ts",
    ), "utf8");
    const schema = await readFile(path.join(root, "src/db/schema.ts"), "utf8");
    const migration = await readFile(path.join(
      root,
      "drizzle/0047_ai_scenario_catalog_config.sql",
    ), "utf8");

    assert.match(operation, /getEnabledAiScenarioProfile\(AI_SCENARIO_KEYS\.SUGGEST_SERIES\)/);
    assert.match(operation, /parseSuggestSeriesConfig\(profile\.config\)/);
    assert.match(operation, /getAiFranchiseCandidates\(context\.currentAuthorId\)/);
    assert.match(operation, /maxItems: resultLimit/);
    assert.match(operation, /`Верни от 0 до \$\{resultLimit\}/);
    assert.match(operation, /const availableIds = new Set\(candidates\.map/);
    assert.match(operation, /const selectedIds = new Set\(input\.selectedFranchiseIds \?\? \[\]\)/);
    assert.match(operation, /\[\.\.\.new Set\(result\.value\.franchiseIds\)\]/);
    assert.match(operation, /availableIds\.has\(id\) && !selectedIds\.has\(id\)/);
    assert.match(operation, /\.slice\(0, resultLimit\)/);
    assert.match(operation, /Number\.isSafeInteger\(id\) && Number\(id\) > 0/);

    assert.match(route, /Promise\.all\(\[getCurrentAdminUser\(\), getCurrentAuthor\(\)\]\)/);
    assert.match(route, /if \(!admin && !author\)/);
    assert.match(route, /\{ error: "unauthorized" \}, \{ status: 401 \}/);
    assert.match(route, /if \(!title \|\| !mediaType \|\| !isMediaTypeCode\(mediaType\)\) return null/);
    assert.match(route, /releaseYear < 0 \|\| releaseYear > 9999/);
    assert.match(route, /selectedFranchiseIds: positiveIds\(source\.selectedFranchiseIds\)/);
    assert.match(route, /\{ error: "invalid-input"[\s\S]*status: 422/);
    assert.match(
      route,
      /!admin && author &&[\s\S]*getAccessibleMediaTypeCodes\(author\.id\)[\s\S]*includes\(input\.mediaType\)/,
    );
    assert.match(route, /\{ error: "forbidden" \}, \{ status: 403 \}/);
    assert.match(route, /if \(!admin && author\) \{\s*const rateLimit = await checkAuthorAiScenarioRateLimit\(author\.id\)/);
    assert.match(route, /error: rateLimit\.error/);
    assert.match(route, /rateLimit\.status === 429/);
    assert.match(route, /retryAfterSeconds: rateLimit\.retryAfterSeconds/);
    assert.match(route, /\{ status: rateLimit\.status \}/);
    assert.ok(
      route.indexOf("getAccessibleMediaTypeCodes(author.id)") <
        route.indexOf("checkAuthorAiScenarioRateLimit(author.id)"),
    );
    assert.ok(
      route.indexOf("checkAuthorAiScenarioRateLimit(author.id)") <
        route.indexOf("suggestFranchisesForMediaItem(input"),
    );
    assert.match(route, /currentAuthorId: admin \? undefined : author\?\.id/);
    assert.match(authorAiRateLimit, /checkFixedWindowRateLimits\(\[/);
    assert.match(
      authorAiRateLimit,
      /keyPrefix: "ai-scenario:author",\s*subject: String\(authorId\),\s*window: "minute",\s*limit: 5/,
    );
    assert.match(
      authorAiRateLimit,
      /keyPrefix: "ai-scenario:author",\s*subject: String\(authorId\),\s*window: "day",\s*limit: 50/,
    );
    assert.match(
      authorAiRateLimit,
      /if \(!result\.ok\)[\s\S]*status: 503[\s\S]*error: "rate-limit-unavailable"/,
    );
    assert.match(
      authorAiRateLimit,
      /if \(!result\.allowed\)[\s\S]*status: 429[\s\S]*error: "author-rate-limit"[\s\S]*retryAfterSeconds: result\.retryAfterSeconds/,
    );
    assert.match(franchiseQuery, /export async function getAiFranchiseCandidates\(currentAuthorId\?: number\)/);
    assert.match(
      franchiseQuery,
      /currentAuthorId[\s\S]*publishedFranchiseCondition[\s\S]*eq\(franchises\.createdByAuthorId, currentAuthorId\)/,
    );
    assert.match(
      franchiseQuery,
      /mediaVisibilityCondition = currentAuthorId[\s\S]*publishedMediaItemCondition[\s\S]*eq\(mediaItems\.createdByAuthorId, currentAuthorId\)/,
    );
    assert.match(
      franchiseQuery,
      /linkVisibilityCondition = currentAuthorId[\s\S]*mediaItemFranchises\.publicationStatus[\s\S]*mediaItemFranchises\.createdByAuthorId, currentAuthorId/,
    );
    assert.match(
      franchiseQuery,
      /\.where\(and\(\s*visibilityCondition,\s*mediaVisibilityCondition,\s*linkVisibilityCondition/,
    );

    assert.match(clientHelper, /fetch\("\/api\/media\/suggest-franchises"/);
    assert.match(clientHelper, /export function resolveSuggestedFranchises/);
    assert.match(clientHelper, /export function appendUniqueFranchiseIds/);
    assert.match(franchiseSuggestionDialog, /requestFranchiseSuggestions\(\{/);
    assert.match(franchiseSuggestionDialog, /assignedFranchises\.map/);
    assert.match(franchiseSuggestionDialog, /resolveSuggestedFranchises\(franchises, excludedIds/);
    assert.match(franchiseSuggestionDialog, /appendUniqueFranchiseIds\(current/);
    assert.match(franchiseSuggestionDialog, /aria-label="Предложить серии"/);
    assert.match(franchiseSuggestionDialog, /label="Предложить серии" side="left"/);
    assert.match(franchiseSuggestionDialog, /min-w-0 flex-1["><]+SearchableFranchiseMultiSelect/);
    assert.match(
      franchiseSuggestionDialog,
      /<FranchiseSuggestionStatus visible=\{isSuggestingFranchises\} \/>/,
    );
    assert.match(franchiseSuggestionDialog, /Не удалось подобрать серии\. Попробуйте ещё раз\./);
    assert.match(mediaForm, /requestFranchiseSuggestions\(\{/);
    assert.match(mediaForm, /resolveSuggestedFranchises\(/);
    assert.match(mediaForm, /appendUniqueFranchiseIds\(/);
    assert.match(mediaForm, /releaseYear: \/\^\\d\+\$\/\.test\(releaseYear\) \? Number\(releaseYear\) : null/);
    assert.match(mediaForm, /selectedFranchiseIds: selectedFranchiseIds\.map\(Number\)/);
    assert.match(
      mediaForm,
      /setSelectedFranchiseIds\(\(current\) =>\s*appendUniqueFranchiseIds\(current, suggested\.map/,
    );
    assert.match(mediaForm, /<fieldset[\s\S]*disabled=\{isSuggestingFranchises\}/);
    assert.match(mediaForm, /canSuggestFranchises \? \(\s*<Tooltip/);
    assert.match(mediaForm, /disabled=\{!title\.trim\(\) \|\| isSuggestingFranchises\}/);
    assert.match(mediaForm, /aria-label="Предложить серии"/);
    assert.match(mediaForm, /<Sparkles className=\{isSuggestingFranchises \? "animate-pulse"/);
    assert.match(mediaForm, /Подходящих серий не найдено/);
    assert.match(mediaForm, /Добавлены серии:/);
    assert.match(mediaForm, /tone: "error"/);
    assert.match(mediaForm, /finally \{\s*setIsSuggestingFranchises\(false\)/);

    assert.match(authorMediaForm, /requestFranchiseSuggestions\(\{/);
    assert.match(authorMediaForm, /resolveSuggestedFranchises\(/);
    assert.match(authorMediaForm, /appendUniqueFranchiseIds\(/);
    assert.match(
      authorMediaForm,
      /releaseYear: \/\^\\d\+\$\/\.test\(releaseYear\) \? Number\(releaseYear\) : null/,
    );
    assert.match(authorMediaForm, /selectedFranchiseIds: selectedFranchiseIds\.map\(Number\)/);
    assert.match(
      authorMediaForm,
      /setSelectedFranchiseIds\(\(current\) =>\s*appendUniqueFranchiseIds\(current, suggested\.map/,
    );
    assert.match(authorMediaForm, /<fieldset[\s\S]*disabled=\{isSuggestingFranchises\}/);
    assert.match(authorMediaForm, /canSuggestFranchises \? \(\s*<Tooltip/);
    assert.match(
      authorMediaForm,
      /disabled=\{!title\.trim\(\) \|\| isSuggestingFranchises\}/,
    );
    assert.match(authorMediaForm, /aria-label="Предложить серии"/);
    assert.match(authorMediaForm, /<Sparkles className=\{isSuggestingFranchises \? "animate-pulse"/);
    assert.match(authorMediaForm, /Подходящих серий не найдено/);
    assert.match(authorMediaForm, /Добавлены серии:/);
    assert.match(authorMediaForm, /tone: "error"/);
    assert.match(authorMediaForm, /finally \{\s*setIsSuggestingFranchises\(false\)/);
    assert.match(
      authorMediaForm,
      /disabled=\{isDuplicateSubmissionBlocked \|\| isSuggestingFranchises\}/,
    );
    for (const source of [
      adminMediaNewPage,
      adminMediaEditPage,
      authorMediaNewPage,
      authorMediaEditPage,
      archivePage,
      mediaItemPage,
      seriesPage,
    ]) {
      assert.match(
        source,
        /isAiScenarioEnabled\(AI_SCENARIO_KEYS\.SUGGEST_SERIES\)/,
      );
      assert.match(
        source,
        /canSuggestFranchises=\{(?:canSuggestFranchises|[^}]+\.canSuggestFranchises)\}/,
      );
    }
    assert.match(
      archiveMediaSuggestion,
      /canSuggestFranchises=\{canSuggestFranchises\}/,
    );

    assert.match(scenarioNew, /listAiScenarioCatalogEntries\(\)/);
    assert.match(scenarioNew, /\.filter\(\(\{ key \}\) => !existingKeys\.has\(key\)\)/);
    assert.match(scenarioList, /getAiScenarioDefinition\(profile\.key\)\?\.name \?\? profile\.name/);
    assert.match(scenarioList, /Неподдерживаемый/);
    assert.match(scenarioList, /getAiScenarioDefinition\(profile\.key\) \? <Tooltip/);
    assert.match(scenarioList, /<ConfirmAction/);
    assert.match(scenarioActions, /export async function deleteAiScenarioAction/);
    assert.match(scenarioActions, /await requireAdminUser\(\)/);
    assert.match(scenarioActions, /deleteAiScenarioProfile/);
    assert.match(scenarioQuery, /tx\.delete\(aiScenarioProfiles\)/);
    assert.match(scenarioQuery, /AI_SCENARIO_NOT_FOUND/);

    assert.match(migration, /ADD COLUMN "instruction" text/);
    assert.match(migration, /ADD COLUMN "config" jsonb DEFAULT '\{\}'::jsonb NOT NULL/);
    assert.doesNotMatch(migration, /UPDATE|DELETE/i);
    assert.match(schema, /instruction: text\("instruction"\)/);
    assert.match(schema, /config: jsonb\("config"\).*default\(\{\}\)\.notNull\(\)/);
  });
});
