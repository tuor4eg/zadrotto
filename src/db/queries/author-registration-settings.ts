import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, authorAccessProfiles, authorRegistrationSettings } from "@/db/schema";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const profileSelection = {
  id: authorAccessProfiles.id,
  code: authorAccessProfiles.code,
  name: authorAccessProfiles.name,
};

export type AuthorRegistrationProfileSource = "database" | "environment" | "automatic";

/** The only profile-selection policy used by registration and admin diagnostics. */
export async function resolveAuthorRegistrationAccessProfile(
  tx: RegistrationTransaction,
  environmentCode = process.env.AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE?.trim(),
) {
  const [databaseProfile] = await tx
    .select(profileSelection)
    .from(authorRegistrationSettings)
    .innerJoin(
      authorAccessProfiles,
      and(
        eq(authorAccessProfiles.id, authorRegistrationSettings.accessProfileId),
        eq(authorAccessProfiles.isSystem, false),
      ),
    )
    .where(eq(authorRegistrationSettings.id, 1))
    .limit(1);

  if (databaseProfile) return { profile: databaseProfile, source: "database" as const };

  if (environmentCode) {
    const [environmentProfile] = await tx
      .select(profileSelection)
      .from(authorAccessProfiles)
      .where(and(
        eq(authorAccessProfiles.code, environmentCode),
        eq(authorAccessProfiles.isSystem, false),
      ))
      .limit(1);

    if (environmentProfile) return { profile: environmentProfile, source: "environment" as const };
  }

  const [automaticProfile] = await tx
    .select(profileSelection)
    .from(authorAccessProfiles)
    .where(eq(authorAccessProfiles.isSystem, false))
    .orderBy(
      asc(authorAccessProfiles.canPublishMediaWithoutReview),
      asc(authorAccessProfiles.canPublishFranchisesWithoutReview),
      sql`${authorAccessProfiles.maxDraftMediaItems} asc nulls last`,
      sql`${authorAccessProfiles.maxDraftMediaItemsPerDay} asc nulls last`,
      asc(authorAccessProfiles.code),
    )
    .limit(1);

  if (!automaticProfile) throw new Error("No assignable author registration access profile");
  return { profile: automaticProfile, source: "automatic" as const };
}

export async function getAuthorRegistrationSettingsDiagnostics() {
  return db.transaction(async (tx) => {
    const [settings] = await tx
      .select({
        accessProfileId: authorRegistrationSettings.accessProfileId,
        updatedAt: authorRegistrationSettings.updatedAt,
      })
      .from(authorRegistrationSettings)
      .where(eq(authorRegistrationSettings.id, 1))
      .limit(1);
    const effective = await resolveAuthorRegistrationAccessProfile(tx);

    return {
      configuredAccessProfileId: settings?.accessProfileId ?? null,
      effectiveProfile: effective.profile,
      source: effective.source,
      updatedAt: settings?.updatedAt ?? null,
    };
  });
}

export async function saveAuthorRegistrationAccessProfile(input: {
  accessProfileId: number;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select(profileSelection)
      .from(authorAccessProfiles)
      .where(and(
        eq(authorAccessProfiles.id, input.accessProfileId),
        eq(authorAccessProfiles.isSystem, false),
      ))
      .limit(1);
    if (!profile) return null;
    const previousEffective = await resolveAuthorRegistrationAccessProfile(tx);

    await tx
      .insert(authorRegistrationSettings)
      .values({ id: 1, accessProfileId: profile.id, updatedByAdminId: input.adminId })
      .onConflictDoUpdate({
        target: authorRegistrationSettings.id,
        set: {
          accessProfileId: profile.id,
          updatedByAdminId: input.adminId,
          updatedAt: new Date(),
        },
      });

    await tx.insert(adminActivityLogs).values({
      ...input.activityLog,
      metadata: {
        oldAccessProfileId: previousEffective.profile.id,
        newAccessProfileId: profile.id,
        newAccessProfileCode: profile.code,
      },
    });

    return { previousAccessProfileId: previousEffective.profile.id, profile };
  });
}
