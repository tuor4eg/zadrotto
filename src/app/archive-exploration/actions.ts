"use server";

import { revalidatePath } from "next/cache";

import {
  advanceArchiveExplorationOnboardingStep,
  claimArchiveExplorationInvite,
  getArchiveExplorationCandidate,
  getArchiveExplorationRatingsCount,
  getArchiveExplorationOnboardingStep,
  setArchiveExplorationAutoShow,
} from "@/db/queries/archive-exploration";
import { upsertAuthorMediaExperience } from "@/db/queries/author-media-experiences";
import {
  AuthorMediaStatusConflictError,
  setAuthorMediaStatus,
} from "@/db/queries/author-media-statuses";
import { getMediaItemIdentityForAuthorRating } from "@/db/queries/media-items";
import {
  getEffectiveMediaTypeOptions,
  getAccessibleMediaTypeCodes,
  saveAuthorMediaTypeOverrides,
} from "@/db/queries/media-types";
import { upsertAuthorRating } from "@/db/queries/ratings";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  isFirstExperienceBeforeRelease,
  parseFirstExperiencedInput,
} from "@/lib/authors/experience-date";
import {
  ARCHIVE_EXPLORATION_RATING_LIMIT,
  ARCHIVE_EXPLORATION_ONBOARDING_STEPS,
  type ArchiveExplorationMediaTypeOption,
  type ArchiveExplorationResult,
} from "@/lib/archive-exploration/model";
import { isAuthorMediaStatus, type AuthorMediaStatus } from "@/lib/media/author-media-status";
import { getRotatedMediaTypeCodes } from "@/lib/main-page/top-archive-settings";
import { RATING_SCORE_VALUES } from "@/lib/ratings/score";

async function getNextArchiveExplorationResult(
  authorId: number,
  afterMediaTypeCode?: string,
): Promise<ArchiveExplorationResult> {
  const ratingsCount = await getArchiveExplorationRatingsCount(authorId);
  if (ratingsCount >= ARCHIVE_EXPLORATION_RATING_LIMIT) {
    return { status: "complete", ratingsCount };
  }
  const effectiveMediaTypes = await getEffectiveMediaTypeOptions(authorId);
  const rotatedMediaTypeCodes = getRotatedMediaTypeCodes(
    effectiveMediaTypes.filter((item) => item.isEnabled).map((item) => item.code),
    new Date(),
  );
  const currentTypeIndex = afterMediaTypeCode
    ? rotatedMediaTypeCodes.indexOf(afterMediaTypeCode)
    : -1;
  const orderedMediaTypeCodes = currentTypeIndex < 0
    ? rotatedMediaTypeCodes
    : [
        ...rotatedMediaTypeCodes.slice(currentTypeIndex + 1),
        ...rotatedMediaTypeCodes.slice(0, currentTypeIndex + 1),
      ];
  const candidate = await getArchiveExplorationCandidate(
    authorId,
    orderedMediaTypeCodes,
  );
  return candidate
    ? { status: "candidate", candidate, ratingsCount }
    : { status: "complete", ratingsCount };
}

export async function claimArchiveExplorationInviteAction() {
  const author = await getCurrentAuthor();
  if (!author) {
    return {
      autoShowEnabled: true,
      onboardingStep: ARCHIVE_EXPLORATION_ONBOARDING_STEPS.invitation,
      shouldShow: false,
    };
  }
  return claimArchiveExplorationInvite(author.id);
}

export async function saveArchiveExplorationAutoShowAction(enabled: boolean) {
  const author = await getCurrentAuthor();
  if (!author || typeof enabled !== "boolean") return { ok: false };
  await setArchiveExplorationAutoShow(author.id, enabled);
  return { ok: true };
}

export async function startArchiveExplorationAction(): Promise<ArchiveExplorationResult> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Войди, чтобы исследовать архив." };
  const ratingsCount = await getArchiveExplorationRatingsCount(author.id);
  if (ratingsCount >= ARCHIVE_EXPLORATION_RATING_LIMIT) {
    await advanceArchiveExplorationOnboardingStep(
      author.id,
      ARCHIVE_EXPLORATION_ONBOARDING_STEPS.completed,
    );
    return { status: "complete", ratingsCount };
  }
  const onboardingStep = await getArchiveExplorationOnboardingStep(author.id);
  if (onboardingStep === ARCHIVE_EXPLORATION_ONBOARDING_STEPS.invitation) {
    return { status: "onboarding" };
  }
  if (onboardingStep === ARCHIVE_EXPLORATION_ONBOARDING_STEPS.interests) {
    return { status: "interests" };
  }
  if (onboardingStep === ARCHIVE_EXPLORATION_ONBOARDING_STEPS.guide) {
    return { status: "ready" };
  }
  if (onboardingStep >= ARCHIVE_EXPLORATION_ONBOARDING_STEPS.completed) {
    return { status: "complete", ratingsCount };
  }
  return getNextArchiveExplorationResult(author.id);
}

export async function beginArchiveExplorationOnboardingAction(): Promise<ArchiveExplorationResult> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Сессия завершилась. Войди снова." };
  await advanceArchiveExplorationOnboardingStep(
    author.id,
    ARCHIVE_EXPLORATION_ONBOARDING_STEPS.ratings,
  );
  return getNextArchiveExplorationResult(author.id);
}

export async function getArchiveExplorationMediaTypesAction(): Promise<
  | { status: "ready"; mediaTypes: ArchiveExplorationMediaTypeOption[] }
  | { status: "error"; message: string }
> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Сессия завершилась. Войди снова." };
  await advanceArchiveExplorationOnboardingStep(
    author.id,
    ARCHIVE_EXPLORATION_ONBOARDING_STEPS.interests,
  );
  const mediaTypes = await getEffectiveMediaTypeOptions(author.id);
  return {
    status: "ready",
    mediaTypes: mediaTypes.map(({ code, description, id, isEnabled, name }) => ({
      code,
      description,
      id,
      isEnabled,
      name,
    })),
  };
}

export async function saveArchiveExplorationMediaTypesAction(
  enabledMediaTypeIds: number[],
): Promise<ArchiveExplorationResult> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Сессия завершилась. Войди снова." };
  if (
    enabledMediaTypeIds.length === 0 ||
    enabledMediaTypeIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(enabledMediaTypeIds).size !== enabledMediaTypeIds.length
  ) {
    return { status: "error", message: "Выбери хотя бы один тип записей." };
  }
  const mediaTypes = await getEffectiveMediaTypeOptions(author.id);
  const accessibleIds = new Set(mediaTypes.map(({ id }) => id));
  if (enabledMediaTypeIds.some((id) => !accessibleIds.has(id))) {
    return { status: "error", message: "Не удалось сохранить выбранные типы записей." };
  }
  const enabledIds = new Set(enabledMediaTypeIds);
  await saveAuthorMediaTypeOverrides({
    authorId: author.id,
    settings: mediaTypes.map(({ id }) => ({
      mediaTypeId: id,
      isEnabled: enabledIds.has(id),
    })),
  });
  await advanceArchiveExplorationOnboardingStep(
    author.id,
    ARCHIVE_EXPLORATION_ONBOARDING_STEPS.guide,
  );
  revalidateMediaTypeSelectionPaths();
  return { status: "ready" };
}

export async function saveArchiveExplorationRatingAction(
  mediaItemCode: string,
  rawScore: number,
  experience: {
    firstExperiencedValue: string;
    firstExperiencedPrecision: string;
  },
): Promise<ArchiveExplorationResult> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Сессия завершилась. Войди снова." };
  const score = RATING_SCORE_VALUES.includes(rawScore) ? rawScore : null;
  if (!mediaItemCode.trim() || score === null) {
    return { status: "error", message: "Не удалось сохранить оценку." };
  }
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const mediaItem = await getMediaItemIdentityForAuthorRating(
    mediaItemCode.trim(),
    author.id,
    accessibleMediaTypeCodes,
  );
  if (!mediaItem) return { status: "error", message: "Запись архива не найдена." };
  const firstExperience = parseFirstExperiencedInput(
    experience.firstExperiencedValue,
    experience.firstExperiencedPrecision,
  );
  if (!firstExperience) {
    return { status: "error", message: "Проверь дату знакомства." };
  }
  if (
    isFirstExperienceBeforeRelease({
      firstExperiencedAt: firstExperience.firstExperiencedAt,
      releaseYear: mediaItem.releaseYear,
    })
  ) {
    return { status: "error", message: "Год знакомства не может быть раньше года выхода." };
  }
  await upsertAuthorRating({ authorId: author.id, mediaItemId: mediaItem.id, score });
  await upsertAuthorMediaExperience({
    authorId: author.id,
    mediaItemId: mediaItem.id,
    ...firstExperience,
  });
  revalidateArchiveExplorationPaths(mediaItem.code);
  const nextResult = await getNextArchiveExplorationResult(author.id, mediaItem.mediaType);
  if (nextResult.status === "complete" && nextResult.ratingsCount >= ARCHIVE_EXPLORATION_RATING_LIMIT) {
    await advanceArchiveExplorationOnboardingStep(
      author.id,
      ARCHIVE_EXPLORATION_ONBOARDING_STEPS.completed,
    );
    return { status: "graduated", ratingsCount: nextResult.ratingsCount };
  }
  return nextResult;
}

export async function saveArchiveExplorationStatusAction(
  mediaItemCode: string,
  status: AuthorMediaStatus,
): Promise<ArchiveExplorationResult> {
  const author = await getCurrentAuthor();
  if (!author) return { status: "error", message: "Сессия завершилась. Войди снова." };
  if (!mediaItemCode.trim() || !isAuthorMediaStatus(status)) {
    return { status: "error", message: "Не удалось сохранить статус записи." };
  }
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const mediaItem = await getMediaItemIdentityForAuthorRating(
    mediaItemCode.trim(),
    author.id,
    accessibleMediaTypeCodes,
  );
  if (!mediaItem) return { status: "error", message: "Запись архива не найдена." };
  try {
    await setAuthorMediaStatus({ authorId: author.id, mediaItemId: mediaItem.id, status });
  } catch (error) {
    if (error instanceof AuthorMediaStatusConflictError) {
      return { status: "error", message: "У записи уже есть твоя оценка." };
    }
    throw error;
  }
  revalidateArchiveExplorationPaths(mediaItem.code);
  return getNextArchiveExplorationResult(author.id, mediaItem.mediaType);
}

function revalidateArchiveExplorationPaths(mediaItemCode: string) {
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath(`/media/${mediaItemCode}`);
  revalidatePath("/author/media");
}

function revalidateMediaTypeSelectionPaths() {
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/series");
  revalidatePath("/series/[code]", "page");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/author/settings/media-types");
}
