import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function getPublicSiteHeaderState(
  currentAuthor?: Awaited<ReturnType<typeof getCurrentAuthor>>,
) {
  const [author, adminUser] = await Promise.all([
    currentAuthor === undefined ? getCurrentAuthor() : Promise.resolve(currentAuthor),
    getCurrentAdminUser(),
  ]);
  const adminNotificationCount = adminUser
    ? await getSubmittedModerationRequestCountForAdmin()
    : 0;

  return {
    adminNotificationCount,
    author,
    currentAdminUser: Boolean(adminUser),
    headerProps: {
      adminNotificationCount,
      author: author
        ? { avatarObjectKey: author.avatarObjectKey, name: author.name }
        : null,
      currentAdminUser: Boolean(adminUser),
    },
  };
}
