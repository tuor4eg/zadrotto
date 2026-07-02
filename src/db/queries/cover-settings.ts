import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  providerCredentials,
  providerRateLimits,
  providerSettings,
  coverSettings,
} from "@/db/schema";
import {
  DEFAULT_COVER_CANDIDATE_LIMIT,
  DEFAULT_COVER_MAX_BYTES,
  DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
} from "@/lib/covers/config";
import {
  decryptCoverProviderCredentials,
  encryptCoverProviderCredentials,
} from "@/lib/covers/credential-crypto";
import {
  getCoverProviderCredentialHint,
  parseCoverProviderCredentials,
} from "@/lib/covers/credential-definitions";
import {
  getCoverProviderDefaultSettings,
  getCoverProviderSettingKey,
  type CoverProviderMediaSetting,
} from "@/lib/covers/provider-settings";
import type { CoverProviderCode } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media/types";

export type CoverSettingsValue = {
  candidateLimit: number;
  tmdbResultScanLimit: number;
  coverMaxBytes: number;
};

export type CoverProviderSettingsValue = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled: boolean;
  priority: number;
};

export type CoverProviderCredentialStatus = {
  providerCode: CoverProviderCode;
  hasCredentials: boolean;
  keyHint: string | null;
  updatedAt: Date | null;
};

export type CoverProviderRateLimitValue = {
  providerCode: CoverProviderCode;
  searchesPerDay: number;
};

export const DEFAULT_COVER_SETTINGS = {
  candidateLimit: DEFAULT_COVER_CANDIDATE_LIMIT,
  tmdbResultScanLimit: DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
  coverMaxBytes: DEFAULT_COVER_MAX_BYTES,
} satisfies CoverSettingsValue;

const COVER_SETTINGS_ID = 1;
const DEFAULT_PROVIDER_SEARCHES_PER_DAY = 1000;

function getKnownProviderCodes() {
  return getCoverProviderDefaultSettings().map((provider) => provider.providerCode);
}

function isKnownProviderCode(value: string): value is CoverProviderCode {
  return getKnownProviderCodes().some((providerCode) => providerCode === value);
}

function isKnownProviderSetting(
  value: {
    mediaType: string;
    providerCode: string;
    enabled: boolean;
    priority: number;
  },
  defaultSettings: readonly CoverProviderMediaSetting[],
): value is CoverProviderSettingsValue {
  return defaultSettings.some(
    (setting) =>
      setting.mediaType === value.mediaType &&
      setting.providerCode === value.providerCode &&
      isKnownProviderCode(value.providerCode),
  );
}

async function ensureCoverProviderSettingsExistDisabled(providerCode: CoverProviderCode) {
  const values = getCoverProviderDefaultSettings()
    .filter((setting) => setting.providerCode === providerCode)
    .map((setting) => ({
      mediaType: setting.mediaType,
      providerCode: setting.providerCode,
      enabled: false,
      priority: setting.priority,
      updatedAt: new Date(),
    }));

  if (values.length === 0) {
    return;
  }

  await db
    .insert(providerSettings)
    .values(values)
    .onConflictDoNothing({
      target: [providerSettings.mediaType, providerSettings.providerCode],
    });
}

function normalizeCoverSettings(row: CoverSettingsValue | null): CoverSettingsValue {
  return {
    candidateLimit: row?.candidateLimit ?? DEFAULT_COVER_SETTINGS.candidateLimit,
    tmdbResultScanLimit:
      row?.tmdbResultScanLimit ?? DEFAULT_COVER_SETTINGS.tmdbResultScanLimit,
    coverMaxBytes: row?.coverMaxBytes ?? DEFAULT_COVER_SETTINGS.coverMaxBytes,
  };
}

function isMissingMediaTypeColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42703"
  );
}

export async function getCoverSettings(): Promise<CoverSettingsValue> {
  const [settings] = await db
    .select({
      candidateLimit: coverSettings.candidateLimit,
      tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
      coverMaxBytes: coverSettings.coverMaxBytes,
    })
    .from(coverSettings)
    .where(eq(coverSettings.id, COVER_SETTINGS_ID))
    .limit(1);

  return normalizeCoverSettings(settings ?? null);
}

export async function updateCoverSettings(
  input: CoverSettingsValue,
): Promise<CoverSettingsValue> {
  const [settings] = await db
    .insert(coverSettings)
    .values({
      id: COVER_SETTINGS_ID,
      candidateLimit: input.candidateLimit,
      tmdbResultScanLimit: input.tmdbResultScanLimit,
      coverMaxBytes: input.coverMaxBytes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coverSettings.id,
      set: {
        candidateLimit: input.candidateLimit,
        tmdbResultScanLimit: input.tmdbResultScanLimit,
        coverMaxBytes: input.coverMaxBytes,
        updatedAt: new Date(),
      },
    })
    .returning({
      candidateLimit: coverSettings.candidateLimit,
      tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
      coverMaxBytes: coverSettings.coverMaxBytes,
    });

  return normalizeCoverSettings(settings ?? null);
}

export async function getCoverProviderSettings(): Promise<CoverProviderSettingsValue[]> {
  const defaultSettings = getCoverProviderDefaultSettings();
  let rows;

  try {
    rows = await db
      .select({
        mediaType: providerSettings.mediaType,
        providerCode: providerSettings.providerCode,
        enabled: providerSettings.enabled,
        priority: providerSettings.priority,
      })
      .from(providerSettings)
      .orderBy(
        asc(providerSettings.mediaType),
        asc(providerSettings.priority),
        asc(providerSettings.providerCode),
      );
  } catch (error) {
    if (isMissingMediaTypeColumnError(error)) {
      return defaultSettings;
    }

    throw error;
  }

  const rowsByKey = new Map(
    rows
      .filter((row) => isKnownProviderSetting(row, defaultSettings))
      .map((row) => [getCoverProviderSettingKey(row), row]),
  );

  return defaultSettings.map((defaults) => ({
    mediaType: defaults.mediaType,
    providerCode: defaults.providerCode,
    enabled: rowsByKey.get(getCoverProviderSettingKey(defaults))?.enabled ?? defaults.enabled,
    priority: rowsByKey.get(getCoverProviderSettingKey(defaults))?.priority ?? defaults.priority,
  })).sort(
    (left, right) =>
      left.mediaType.localeCompare(right.mediaType) || left.priority - right.priority,
  );
}

export async function updateCoverProviderSettings(
  input: readonly CoverProviderSettingsValue[],
): Promise<CoverProviderSettingsValue[]> {
  const knownSettingKeys = new Set(
    getCoverProviderDefaultSettings().map((setting) => getCoverProviderSettingKey(setting)),
  );
  const values = input
    .filter((provider) => knownSettingKeys.has(getCoverProviderSettingKey(provider)))
    .map((provider) => ({
      mediaType: provider.mediaType,
      providerCode: provider.providerCode,
      enabled: provider.enabled,
      priority: provider.priority,
      updatedAt: new Date(),
    }));

  if (values.length > 0) {
    await db
      .insert(providerSettings)
      .values(values)
      .onConflictDoUpdate({
        target: [providerSettings.mediaType, providerSettings.providerCode],
        set: {
          enabled: sql`excluded.enabled`,
          priority: sql`excluded.priority`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return getCoverProviderSettings();
}

export async function getCoverProviderRateLimits(): Promise<CoverProviderRateLimitValue[]> {
  const rows = await db
    .select({
      providerCode: providerRateLimits.providerCode,
      searchesPerDay: providerRateLimits.searchesPerDay,
    })
    .from(providerRateLimits);
  const rowsByProviderCode = new Map(
    rows
      .filter((row): row is CoverProviderRateLimitValue => isKnownProviderCode(row.providerCode))
      .map((row) => [row.providerCode, row]),
  );

  return [...new Set(getKnownProviderCodes())].map((providerCode) => ({
    providerCode,
    searchesPerDay:
      rowsByProviderCode.get(providerCode)?.searchesPerDay ?? DEFAULT_PROVIDER_SEARCHES_PER_DAY,
  }));
}

export async function updateCoverProviderRateLimits(
  input: readonly CoverProviderRateLimitValue[],
): Promise<CoverProviderRateLimitValue[]> {
  const values = input
    .filter((limit) => isKnownProviderCode(limit.providerCode))
    .map((limit) => ({
      providerCode: limit.providerCode,
      searchesPerDay: limit.searchesPerDay,
      updatedAt: new Date(),
    }));

  if (values.length > 0) {
    await db
      .insert(providerRateLimits)
      .values(values)
      .onConflictDoUpdate({
        target: providerRateLimits.providerCode,
        set: {
          searchesPerDay: sql`excluded.searches_per_day`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return getCoverProviderRateLimits();
}

export async function getCoverProviderCredentialStatuses(): Promise<
  CoverProviderCredentialStatus[]
> {
  const rows = await db
    .select({
      providerCode: providerCredentials.providerCode,
      keyHint: providerCredentials.keyHint,
      updatedAt: providerCredentials.updatedAt,
    })
    .from(providerCredentials);
  const rowsByProviderCode = new Map(
    rows
      .filter((row): row is {
        providerCode: CoverProviderCode;
        keyHint: string;
        updatedAt: Date;
      } => isKnownProviderCode(row.providerCode))
      .map((row) => [row.providerCode, row]),
  );

  return [...new Set(getKnownProviderCodes())].map((providerCode) => {
    const row = rowsByProviderCode.get(providerCode);

    return {
      providerCode,
      hasCredentials: Boolean(row),
      keyHint: row?.keyHint ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function getCoverProviderCredentialsForSearch() {
  const rows = await db
    .select({
      providerCode: providerCredentials.providerCode,
      encryptedPayload: providerCredentials.encryptedPayload,
    })
    .from(providerCredentials);
  const credentials: Partial<Record<CoverProviderCode, Record<string, string>>> = {};

  for (const row of rows) {
    if (!isKnownProviderCode(row.providerCode)) {
      continue;
    }

    const decrypted = decryptCoverProviderCredentials(row.encryptedPayload);

    if (decrypted) {
      credentials[row.providerCode] = decrypted;
    }
  }

  return credentials;
}

export async function updateCoverProviderCredentials(input: {
  adminId: number;
  providerCode: CoverProviderCode;
  values: Record<string, string>;
}) {
  const parsed = parseCoverProviderCredentials({
    providerCode: input.providerCode,
    values: input.values,
  });

  if (!parsed.ok) {
    return parsed;
  }

  const encryptedPayload = encryptCoverProviderCredentials(parsed.value);

  if (!encryptedPayload) {
    return { ok: false as const, error: "missing-master-key" as const };
  }

  const keyHint = getCoverProviderCredentialHint(parsed.value);

  await db
    .insert(providerCredentials)
    .values({
      providerCode: input.providerCode,
      encryptedPayload,
      keyHint,
      updatedByAdminId: input.adminId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerCredentials.providerCode,
      set: {
        encryptedPayload,
        keyHint,
        updatedByAdminId: input.adminId,
        updatedAt: new Date(),
      },
    });
  await ensureCoverProviderSettingsExistDisabled(input.providerCode);

  return { ok: true as const };
}
