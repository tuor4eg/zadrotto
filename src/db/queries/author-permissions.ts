import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { authorPermissions } from "@/db/schema";
import type { AuthorPermission } from "@/lib/author-permissions";

export async function getAuthorPermissions(authorId: number) {
  const permissions = await db
    .select({
      permission: authorPermissions.permission,
    })
    .from(authorPermissions)
    .where(eq(authorPermissions.authorId, authorId));

  return permissions.map((item) => item.permission);
}

export async function authorHasPermission(authorId: number, permission: AuthorPermission) {
  const [record] = await db
    .select({
      id: authorPermissions.id,
    })
    .from(authorPermissions)
    .where(
      and(
        eq(authorPermissions.authorId, authorId),
        eq(authorPermissions.permission, permission),
      ),
    )
    .limit(1);

  return Boolean(record);
}

export async function getAuthorPermissionsByAuthorIds(authorIds: number[]) {
  const permissionMap = new Map<number, Set<AuthorPermission>>();

  if (authorIds.length === 0) {
    return permissionMap;
  }

  const records = await db
    .select({
      authorId: authorPermissions.authorId,
      permission: authorPermissions.permission,
    })
    .from(authorPermissions)
    .where(inArray(authorPermissions.authorId, authorIds));

  for (const record of records) {
    const permissions = permissionMap.get(record.authorId) ?? new Set<AuthorPermission>();

    permissions.add(record.permission);
    permissionMap.set(record.authorId, permissions);
  }

  return permissionMap;
}

export async function setAuthorPermission(input: {
  authorId: number;
  permission: AuthorPermission;
  isEnabled: boolean;
  createdByAdminId: number | null;
}) {
  if (input.isEnabled) {
    await db
      .insert(authorPermissions)
      .values({
        authorId: input.authorId,
        permission: input.permission,
        createdByAdminId: input.createdByAdminId,
      })
      .onConflictDoNothing({
        target: [authorPermissions.authorId, authorPermissions.permission],
      });

    return;
  }

  await db
    .delete(authorPermissions)
    .where(
      and(
        eq(authorPermissions.authorId, input.authorId),
        eq(authorPermissions.permission, input.permission),
      ),
    );
}
