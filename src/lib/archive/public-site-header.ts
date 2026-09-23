import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import {
  getActiveQuiz,
  getActiveQuizParticipantState,
} from "@/db/queries/quizzes";
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
  const activeQuiz = author ? await getActiveQuiz() : null;
  const [activeQuizParticipant, effectiveMediaTypes] = activeQuiz && author
    ? await Promise.all([
        getActiveQuizParticipantState(author.id),
        getEffectiveMediaTypeOptions(author.id),
      ])
    : [null, []];
  const unavailableQuizMediaTypeNames = activeQuiz
    ? effectiveMediaTypes
        .filter(({ code, isEnabled }) => !isEnabled && (
          activeQuiz.mediaTypes.length === 0 || activeQuiz.mediaTypes.includes(code)
        ))
        .map(({ name }) => name)
    : [];

  return {
    activeQuiz,
    activeQuizParticipant,
    adminNotificationCount,
    author,
    currentAdminUser: Boolean(adminUser),
    headerProps: {
      adminNotificationCount,
      author: author
        ? { avatarObjectKey: author.avatarObjectKey, name: author.name }
        : null,
      currentAdminUser: Boolean(adminUser),
      quiz: activeQuiz
        ? {
            participant: activeQuizParticipant?.quizId === activeQuiz.id
              ? activeQuizParticipant
              : null,
            quiz: activeQuiz,
            unavailableMediaTypeNames: unavailableQuizMediaTypeNames,
          }
        : null,
    },
  };
}
