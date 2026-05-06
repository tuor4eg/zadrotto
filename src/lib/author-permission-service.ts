import {
  authorHasPermission,
  getAuthorPermissions,
  getAuthorPermissionsByAuthorIds,
  setAuthorPermission,
} from "@/db/queries/author-permissions";
import type { AuthorPermission } from "@/lib/author-permissions";

export async function listAuthorPermissions(authorId: number) {
  return getAuthorPermissions(authorId);
}

export async function listAuthorPermissionsByAuthorIds(authorIds: number[]) {
  return getAuthorPermissionsByAuthorIds(authorIds);
}

export async function checkAuthorPermission(authorId: number, permission: AuthorPermission) {
  return authorHasPermission(authorId, permission);
}

export async function saveAuthorPermission(input: {
  authorId: number;
  permission: AuthorPermission;
  isEnabled: boolean;
  createdByAdminId: number | null;
}) {
  await setAuthorPermission(input);
}
