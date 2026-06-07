import {
  DEFAULT_COVER_CANDIDATE_LIMIT,
  DEFAULT_COVER_MAX_BYTES,
  DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
} from "@/lib/covers/config";
import {
  getCoverProviderDefaultSettings,
  getCoverProviderSettingKey,
} from "@/lib/covers/provider-settings";
import type { CoverProviderCode } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media-types";

const BYTES_IN_MEGABYTE = 1024 * 1024;
const CANDIDATE_LIMIT_MIN = 1;
const CANDIDATE_LIMIT_MAX = 32;
const TMDB_SCAN_LIMIT_MIN = 1;
const TMDB_SCAN_LIMIT_MAX = 10;
const COVER_MAX_MEGABYTES_MIN = 1;
const COVER_MAX_MEGABYTES_MAX = 25;
const PROVIDER_PRIORITY_MIN = 1;
const PROVIDER_PRIORITY_MAX = 999;

export type CoverSettingsFormInput = {
  candidateLimit: number;
  tmdbResultScanLimit: number;
  coverMaxBytes: number;
};

export type CoverProviderSettingsFormInput = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled: boolean;
  priority: number;
};

export const COVER_SETTINGS_ERROR_MESSAGES = {
  "invalid-limit": "Проверь числовые лимиты обложек.",
  "invalid-provider": "Проверь настройки провайдеров обложек.",
} as const;

function parseBoundedInteger(input: {
  value: string;
  min: number;
  max: number;
}) {
  const normalizedValue = input.value.trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return { ok: false as const };
  }

  const parsedValue = Number(normalizedValue);

  return Number.isSafeInteger(parsedValue) &&
    parsedValue >= input.min &&
    parsedValue <= input.max
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}

export function formatCoverMaxMegabytes(maxCoverBytes: number) {
  return String(Math.max(1, Math.floor(maxCoverBytes / BYTES_IN_MEGABYTE)));
}

export function parseCoverSettingsFormInput(input: {
  candidateLimit: string;
  tmdbResultScanLimit: string;
  coverMaxMegabytes: string;
}) {
  const candidateLimit = parseBoundedInteger({
    value: input.candidateLimit,
    min: CANDIDATE_LIMIT_MIN,
    max: CANDIDATE_LIMIT_MAX,
  });
  const tmdbResultScanLimit = parseBoundedInteger({
    value: input.tmdbResultScanLimit,
    min: TMDB_SCAN_LIMIT_MIN,
    max: TMDB_SCAN_LIMIT_MAX,
  });
  const coverMaxMegabytes = parseBoundedInteger({
    value: input.coverMaxMegabytes,
    min: COVER_MAX_MEGABYTES_MIN,
    max: COVER_MAX_MEGABYTES_MAX,
  });

  if (!candidateLimit.ok || !tmdbResultScanLimit.ok || !coverMaxMegabytes.ok) {
    return { ok: false as const, error: "invalid-limit" as const };
  }

  const coverMaxBytes = coverMaxMegabytes.value * BYTES_IN_MEGABYTE;

  if (!Number.isSafeInteger(coverMaxBytes)) {
    return { ok: false as const, error: "invalid-limit" as const };
  }

  return {
    ok: true as const,
    value: {
      candidateLimit: candidateLimit.value,
      tmdbResultScanLimit: tmdbResultScanLimit.value,
      coverMaxBytes,
    } satisfies CoverSettingsFormInput,
  };
}

export function parseCoverProviderSettingsFormInput(formData: FormData) {
  const defaultSettings = getCoverProviderDefaultSettings();
  const knownSettingKeys = defaultSettings.map((setting) => getCoverProviderSettingKey(setting));
  const selectedSettingKeys = formData
    .getAll("providerSettingKey")
    .filter((value): value is string =>
      typeof value === "string" && knownSettingKeys.some((key) => key === value),
    );

  if (selectedSettingKeys.length !== knownSettingKeys.length) {
    return { ok: false as const, error: "invalid-provider" as const };
  }

  const settings: CoverProviderSettingsFormInput[] = [];

  for (const provider of defaultSettings) {
    const settingKey = getCoverProviderSettingKey(provider);
    const priority = parseBoundedInteger({
      value: String(formData.get(`providerPriority:${settingKey}`) ?? ""),
      min: PROVIDER_PRIORITY_MIN,
      max: PROVIDER_PRIORITY_MAX,
    });

    if (!priority.ok) {
      return { ok: false as const, error: "invalid-provider" as const };
    }

    settings.push({
      mediaType: provider.mediaType,
      providerCode: provider.providerCode,
      enabled: formData.get(`providerEnabled:${settingKey}`) === "1",
      priority: priority.value,
    });
  }

  return {
    ok: true as const,
    value: settings,
  };
}

export const COVER_SETTINGS_FORM_LIMITS = {
  candidateLimit: {
    min: CANDIDATE_LIMIT_MIN,
    max: CANDIDATE_LIMIT_MAX,
    defaultValue: DEFAULT_COVER_CANDIDATE_LIMIT,
  },
  tmdbResultScanLimit: {
    min: TMDB_SCAN_LIMIT_MIN,
    max: TMDB_SCAN_LIMIT_MAX,
    defaultValue: DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
  },
  coverMaxMegabytes: {
    min: COVER_MAX_MEGABYTES_MIN,
    max: COVER_MAX_MEGABYTES_MAX,
    defaultValue: DEFAULT_COVER_MAX_BYTES / BYTES_IN_MEGABYTE,
  },
} as const;
