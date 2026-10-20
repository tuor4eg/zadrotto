import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { adminActivityLogs, providerSettings } from "@/db/schema";
import type { BookProviderCode } from "./types";

export const BOOK_PROVIDERS = ["fantlab", "google-books", "open-library"] as const;

export function parseBookProviders(value: string): BookProviderCode[] {
  const configured = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (configured.some((provider) => !BOOK_PROVIDERS.some((allowed) => allowed === provider))) throw new Error("Invalid book provider configuration.");
  return [...new Set(configured)] as BookProviderCode[];
}

export async function getNormalizedBookProviders(connection: typeof db | DbTransaction = db): Promise<BookProviderCode[]> {
  const rows = await connection.select({ provider: providerSettings.providerCode }).from(providerSettings)
    .where(and(eq(providerSettings.mediaType, "book"), inArray(providerSettings.providerCode, BOOK_PROVIDERS), eq(providerSettings.normalizedBookMetadata, true)))
    .orderBy(asc(providerSettings.providerCode));
  return rows.map((row) => row.provider as BookProviderCode);
}

/** Transactional callers retain a shared lock until their working-data changes commit. */
export async function isNormalizedBookProvider(provider: string | null | undefined, connection: typeof db | DbTransaction = db) {
  if (!provider || !BOOK_PROVIDERS.some((code) => code === provider)) return false;
  const query = connection.select({ enabled: providerSettings.normalizedBookMetadata }).from(providerSettings)
    .where(and(eq(providerSettings.mediaType, "book"), eq(providerSettings.providerCode, provider)));
  const [row] = await (connection === db ? query : query.for("share"));
  return row?.enabled ?? false;
}

/** One-way cutover: frozen legacy JSON cannot safely serve as a rollback source. */
export async function enableNormalizedBookProvider(provider: string, adminId: number) {
  if (!BOOK_PROVIDERS.some((code) => code === provider)) throw new Error("INVALID_BOOK_PROVIDER");
  return db.transaction(async (tx) => {
    const [settings] = await tx.select({ enabled: providerSettings.normalizedBookMetadata }).from(providerSettings)
      .where(and(eq(providerSettings.mediaType, "book"), eq(providerSettings.providerCode, provider))).for("update");
    if (!settings) throw new Error("BOOK_PROVIDER_SETTING_MISSING");
    if (settings.enabled) return { enabled: true as const, report: null };
    const { auditNormalizedBookCutover } = await import("./book-cutover-check");
    const [report] = await auditNormalizedBookCutover([provider as BookProviderCode], tx);
    if (!report.ready) return { enabled: false as const, report };
    await tx.update(providerSettings).set({ normalizedBookMetadata: true, updatedAt: new Date() })
      .where(and(eq(providerSettings.mediaType, "book"), eq(providerSettings.providerCode, provider)));
    await tx.insert(adminActivityLogs).values({ actorType: "admin", adminUserId: adminId, action: "book-provider.normalized-metadata.enabled",
      entityType: "cover-provider", status: "success", message: "Включены нормализованные метаданные книг.", metadata: { provider, books: report.books } });
    return { enabled: true as const, report };
  });
}
