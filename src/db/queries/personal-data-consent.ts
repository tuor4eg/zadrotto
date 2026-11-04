import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { authors, personalDataConsents, personalDataConsentSettings } from "@/db/schema";
import { CURRENT_CONSENT_VERSION } from "@/lib/privacy/consent";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function hasCurrentPersonalDataConsent(authorId: number, connection: Transaction | typeof db = db) {
  const [row] = await connection.select({ id: personalDataConsents.id }).from(personalDataConsents).where(and(
    eq(personalDataConsents.authorId, authorId),
    eq(personalDataConsents.version, CURRENT_CONSENT_VERSION),
    isNull(personalDataConsents.revokedAt),
  )).limit(1);
  return Boolean(row);
}

/** Single server policy for access; disabling the requirement does not fabricate consent. */
export async function isPersonalDataConsentRequired(connection: Transaction | typeof db = db) {
  const [settings] = await connection.select({ required: personalDataConsentSettings.requireConsent })
    .from(personalDataConsentSettings).where(eq(personalDataConsentSettings.id, 1));
  return settings?.required ?? false;
}

export async function hasRequiredPersonalDataConsent(authorId: number, connection: Transaction | typeof db = db) {
  return !(await isPersonalDataConsentRequired(connection)) || await hasCurrentPersonalDataConsent(authorId, connection);
}

// The author lock serializes acceptance and withdrawal, including registration transactions.
export async function insertPersonalDataConsent(tx: Transaction, authorId: number, version: string) {
  if (version !== CURRENT_CONSENT_VERSION) return false;
  const [author] = await tx.select({ id: authors.id }).from(authors).where(eq(authors.id, authorId)).for("update");
  if (!author) return false;
  await tx.insert(personalDataConsents).values({ authorId, version }).onConflictDoNothing();
  return true;
}

export async function acceptPersonalDataConsent(authorId: number, version: string) {
  return db.transaction((tx) => insertPersonalDataConsent(tx, authorId, version));
}

export async function revokePersonalDataConsent(authorId: number) {
  return db.transaction(async (tx) => {
    await tx.select({ id: authors.id }).from(authors).where(eq(authors.id, authorId)).for("update");
    await tx.update(personalDataConsents).set({ revokedAt: sql`clock_timestamp()` }).where(and(
      eq(personalDataConsents.authorId, authorId), isNull(personalDataConsents.revokedAt),
    ));
  });
}

export async function getPersonalDataConsentSettings() {
  const [settings] = await db.select({ requireConsent: personalDataConsentSettings.requireConsent, operatorDetails: personalDataConsentSettings.operatorDetails, contact: personalDataConsentSettings.contact })
    .from(personalDataConsentSettings).where(eq(personalDataConsentSettings.id, 1));
  return settings ?? { requireConsent: false, operatorDetails: "", contact: "" };
}

export async function savePersonalDataConsentSettings(input: { requireConsent: boolean; operatorDetails: string; contact: string }) {
  await db.insert(personalDataConsentSettings).values({ id: 1, ...input }).onConflictDoUpdate({
    target: personalDataConsentSettings.id, set: input,
  });
}
