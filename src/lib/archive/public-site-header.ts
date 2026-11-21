import { hasPublicTags } from "@/db/queries/tags";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import {
  getActiveQuiz,
  getActiveQuizParticipantState,
  getQuizById,
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
  const [adminNotificationCount, activeQuiz, incomingFriendRequestCount, hasTags] = await Promise.all([
    adminUser ? getSubmittedModerationRequestCountForAdmin() : Promise.resolve(0),
    author ? getActiveQuiz() : Promise.resolve(null),
    author ? getIncomingFriendRequestCount(author.id) : Promise.resolve(0),
    getEnabledMediaTypeCodes(author?.id).then(hasPublicTags),
  ]);
  const [activeQuizParticipant, effectiveMediaTypes] = activeQuiz && author
    ? await Promise.all([
        getActiveQuizParticipantState(author.id),
        getEffectiveMediaTypeOptions(author.id),
      ])
    : [null, []];
  const playableQuiz = activeQuiz?.type === "mosaic" && activeQuizParticipant && author
    ? (await getQuizById(activeQuiz.id, author.id))?.quiz ?? activeQuiz
    : activeQuiz;
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
      hasTags,
      adminNotificationCount,
      author: author
        ? { avatarObjectKey: author.avatarObjectKey, name: author.name, id: author.id, incomingFriendRequestCount }
        : null,
      currentAdminUser: Boolean(adminUser),
      quiz: activeQuiz
        ? {
            participant: activeQuizParticipant?.quizId === activeQuiz.id
              ? activeQuizParticipant
              : null,
            quiz: playableQuiz!,
            unavailableMediaTypeNames: unavailableQuizMediaTypeNames,
          }
        : null,
    },
  };
}
