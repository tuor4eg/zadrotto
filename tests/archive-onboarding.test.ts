import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  acknowledgeArchiveOnboardingStep,
  ARCHIVE_ONBOARDING_COACH_MARK_TEXT,
  ARCHIVE_ONBOARDING_GOAL_COUNT,
  ARCHIVE_ONBOARDING_IMAGE_SRC,
  ARCHIVE_ONBOARDING_RATING_SAVED_EVENT,
  ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT,
  ARCHIVE_ONBOARDING_STORAGE_KEY,
  dismissArchiveOnboardingStorage,
  EMPTY_ARCHIVE_ONBOARDING_STORAGE,
  getArchiveOnboardingCard,
  isArchiveOnboardingMediaPath,
  isArchiveOnboardingPath,
  isArchiveOnboardingRatingPath,
  reconcileArchiveOnboardingStorage,
} from "../src/lib/onboarding/model"
import { parseArchiveOnboardingStorage, getArchiveOnboardingStorageKey } from "../src/lib/onboarding/storage"

const modelSource = readFileSync("src/lib/onboarding/model.ts", "utf8")
const cardSource = readFileSync("src/components/onboarding/onboarding-hud-card.tsx", "utf8")
const coachSource = readFileSync("src/components/onboarding/rating-coach-anchor.tsx", "utf8")
const demoLoginPromptSource = readFileSync("src/components/user-state/demo-login-prompt-card.tsx", "utf8")
const layerSource = readFileSync("src/components/external-interface/external-interface-layer.tsx", "utf8")
const hudApiSource = readFileSync("src/app/api/user-hud/route.ts", "utf8")
const ratingsQuerySource = readFileSync("src/db/queries/ratings.ts", "utf8")
const ratingFormSource = readFileSync("src/app/author-rating-form.tsx", "utf8")
const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8")
const ratingDialogSource = readFileSync("src/app/media-item-rating-dialog.tsx", "utf8")

function visibleCard(input: {
  completed?: boolean
  dismissed?: boolean
  firstAchievementSeen?: boolean
  ratingsCount: number
  recordFocused?: boolean
  showFirstAchievement?: boolean
  started?: boolean
}) {
  return getArchiveOnboardingCard({
    completed: input.completed ?? false,
    dismissed: input.dismissed ?? false,
    firstAchievementSeen: input.firstAchievementSeen ?? true,
    ratingsCount: input.ratingsCount,
    recordFocused: input.recordFocused ?? false,
    showFirstAchievement: input.showFirstAchievement ?? false,
    started: input.started ?? true,
  })
}

describe("archive onboarding steps", () => {
  it("shows start, hint, first achievement, progress, and completion copy without using title slang", () => {
    const start = visibleCard({ ratingsCount: 0 })
    const hint = visibleCard({ ratingsCount: 0, recordFocused: true })
    const achievement = visibleCard({
      firstAchievementSeen: false,
      ratingsCount: 1,
      showFirstAchievement: true,
    })
    const first = visibleCard({ ratingsCount: 1 })
    const second = visibleCard({ ratingsCount: 2 })
    const complete = visibleCard({ ratingsCount: 3 })

    assert.equal(start?.stepId, "start")
    assert.equal(start?.title, "Начни свой архив")
    assert.match(start?.body ?? "", /запись/)
    assert.equal(start?.imageSrc, ARCHIVE_ONBOARDING_IMAGE_SRC)
    assert.equal(ARCHIVE_ONBOARDING_IMAGE_SRC, "/mascot/deadz_map.webp")
    assert.equal(start?.showRatingCoachMark, false)
    assert.equal(start?.canHide, false)
    assert.equal(hint?.canHide, false)
    assert.equal(achievement?.canHide, false)
    assert.equal(first?.canHide, true)

    assert.equal(hint?.stepId, "hint")
    assert.equal(hint?.title, "Знакомая запись?")
    assert.equal(hint?.showRatingCoachMark, true)

    assert.equal(achievement?.stepId, "achievement")
    assert.equal(achievement?.title, "Первая ачивка!")
    assert.match(achievement?.body ?? "", /Поздравляю/)

    assert.equal(first?.stepId, "progress")
    assert.equal(first?.title, "Отлично!")
    assert.match(first?.body ?? "", /ещё 2 знакомых записи/)
    assert.equal(first?.ratingsCount, 1)

    assert.equal(second?.stepId, "progress")
    assert.match(second?.body ?? "", /ещё 1 знакомую запись/)
    assert.equal(second?.ratingsCount, 2)

    assert.equal(complete?.stepId, "complete")
    assert.equal(complete?.title, "Архив начат!")
    assert.match(complete?.body ?? "", /записи/)
    assert.doesNotMatch(
      [start, hint, achievement, first, second, complete]
        .map((card) => `${card?.title} ${card?.body}`)
        .join("\n"),
      /тайтл/i,
    )
    assert.doesNotMatch(ARCHIVE_ONBOARDING_COACH_MARK_TEXT, /тайтл/i)
    assert.equal(ARCHIVE_ONBOARDING_GOAL_COUNT, 3)
  })

  it("hides onboarding after dismiss, completion, or when an existing author already has three ratings", () => {
    assert.equal(visibleCard({ ratingsCount: 0, dismissed: true })?.stepId, undefined)
    assert.equal(visibleCard({ ratingsCount: 1, dismissed: true })?.stepId, undefined)
    assert.equal(
      getArchiveOnboardingCard({
        completed: true,
        dismissed: false,
        firstAchievementSeen: true,
        ratingsCount: 0,
        recordFocused: false,
        showFirstAchievement: false,
        started: true,
      })?.stepId,
      "start",
    )
    assert.equal(visibleCard({ ratingsCount: 1, completed: true })?.stepId, "progress")
    assert.equal(
      getArchiveOnboardingCard({
        completed: false,
        dismissed: false,
        firstAchievementSeen: true,
        ratingsCount: 5,
        recordFocused: false,
        showFirstAchievement: false,
        started: false,
      }),
      null,
    )
    assert.equal(
      getArchiveOnboardingCard({
        completed: true,
        dismissed: false,
        firstAchievementSeen: true,
        ratingsCount: 3,
        recordFocused: false,
        showFirstAchievement: false,
        started: true,
      }),
      null,
    )
    assert.equal(
      getArchiveOnboardingCard({
        completed: false,
        dismissed: false,
        firstAchievementSeen: true,
        ratingsCount: 3,
        recordFocused: false,
        showFirstAchievement: false,
        started: true,
      })?.stepId,
      "complete",
    )
    assert.equal(
      reconcileArchiveOnboardingStorage(
        {
          acknowledgedStepId: null,
          completed: true,
          dismissed: true,
          firstAchievementSeen: false,
          started: true,
        },
        0,
      ).dismissed,
      true,
    )
    assert.equal(
      reconcileArchiveOnboardingStorage(
        {
          acknowledgedStepId: null,
          completed: true,
          dismissed: true,
          firstAchievementSeen: false,
          started: true,
        },
        0,
      ).completed,
      false,
    )
    assert.equal(
      reconcileArchiveOnboardingStorage(EMPTY_ARCHIVE_ONBOARDING_STORAGE, 5).completed,
      true,
    )
    assert.equal(
      reconcileArchiveOnboardingStorage(EMPTY_ARCHIVE_ONBOARDING_STORAGE, 0).started,
      true,
    )
    assert.deepEqual(
      dismissArchiveOnboardingStorage({
        acknowledgedStepId: "start",
        completed: false,
        dismissed: false,
        firstAchievementSeen: false,
        started: true,
      }),
      {
        acknowledgedStepId: "start",
        completed: false,
        dismissed: true,
        firstAchievementSeen: false,
        started: true,
      },
    )
    assert.equal(
      acknowledgeArchiveOnboardingStep(
        {
          acknowledgedStepId: null,
          completed: false,
          dismissed: false,
          firstAchievementSeen: false,
          started: true,
        },
        "complete",
      ).dismissed,
      true,
    )
    assert.equal(
      acknowledgeArchiveOnboardingStep(
        {
          acknowledgedStepId: null,
          completed: false,
          dismissed: false,
          firstAchievementSeen: false,
          started: true,
        },
        "complete",
      ).completed,
      true,
    )
    assert.equal(
      acknowledgeArchiveOnboardingStep(
        {
          acknowledgedStepId: null,
          completed: false,
          dismissed: false,
          firstAchievementSeen: false,
          started: true,
        },
        "hint",
      ).acknowledgedStepId,
      "hint",
    )
    assert.equal(
      acknowledgeArchiveOnboardingStep(
        {
          acknowledgedStepId: null,
          completed: false,
          dismissed: false,
          firstAchievementSeen: false,
          started: true,
        },
        "achievement",
      ).firstAchievementSeen,
      true,
    )
  })

  it("keeps onboarding off author and admin shells and treats a media dossier as a focused record", () => {
    assert.equal(isArchiveOnboardingPath("/"), true)
    assert.equal(isArchiveOnboardingPath("/archive"), true)
    assert.equal(isArchiveOnboardingPath("/media/alien"), true)
    assert.equal(isArchiveOnboardingPath("/author"), false)
    assert.equal(isArchiveOnboardingPath("/author/login"), false)
    assert.equal(isArchiveOnboardingPath("/admin/media"), false)
    assert.equal(isArchiveOnboardingMediaPath("/media/alien"), true)
    assert.equal(isArchiveOnboardingRatingPath("/"), false)
    assert.equal(isArchiveOnboardingRatingPath("/archive"), true)
    assert.equal(isArchiveOnboardingRatingPath("/media/alien"), true)
    assert.equal(isArchiveOnboardingRatingPath("/collections"), false)
    assert.equal(isArchiveOnboardingMediaPath("/media/alien/edit"), false)
  })

  it("parses persisted storage without requiring an author id", () => {
    assert.deepEqual(
      parseArchiveOnboardingStorage({
        acknowledgedStepId: "hint",
        completed: false,
        dismissed: false,
        firstAchievementSeen: true,
        started: true,
      }),
      {
        acknowledgedStepId: "hint",
        completed: false,
        dismissed: false,
        firstAchievementSeen: true,
        started: true,
      },
    )
    assert.equal(parseArchiveOnboardingStorage({ authorId: 12, started: "yes" }).started, false)
    assert.equal(ARCHIVE_ONBOARDING_STORAGE_KEY, "zadrotto.archive-onboarding")
    assert.equal(getArchiveOnboardingStorageKey(null), ARCHIVE_ONBOARDING_STORAGE_KEY)
    assert.equal(getArchiveOnboardingStorageKey(42), "zadrotto.archive-onboarding:author:42")
    assert.doesNotMatch(modelSource, /authorId/)
    assert.doesNotMatch(modelSource, /getCurrentAuthor/)
  })
})

describe("archive onboarding HUD wiring", () => {
  it("loads ratingsCount through the shared HUD API and refreshes after a saved rating", () => {
    assert.match(hudApiSource, /getAuthorRatingsCount\(author\.id\)/)
    assert.match(hudApiSource, /authorId: author\.id/)
    assert.match(hudApiSource, /ratingsCount: 0/)
    assert.match(ratingsQuerySource, /export async function getAuthorRatingsCount/)
    assert.match(ratingsQuerySource, /count\(\$\{ratings\.id\}\)::int/)
    assert.match(layerSource, /refreshUserHud/)
    assert.match(layerSource, /USER_HUD_REFRESH_EVENT/)
    assert.match(layerSource, /ARCHIVE_ONBOARDING_RATING_SAVED_EVENT/)
    assert.match(layerSource, /demo: isDemo/)
    assert.match(layerSource, /DemoProfileImportBridge/)
    assert.match(layerSource, /DemoLoginPromptCard/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /DEMO_ONBOARDING_STORAGE_AUTHOR_KEY/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /demo = false/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /onNeverShow/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /dismissArchiveOnboardingStorage/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /showCompletion/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /completionPathRef/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /completionPathRef\.current === pathname/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /previousRatingsRef/)
    assert.match(
      readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"),
      /showCompletion[\s\S]*previousRatings >= ARCHIVE_ONBOARDING_GOAL_COUNT[\s\S]*ratingsCount > previousRatings[\s\S]*completed: true[\s\S]*setShowCompletion\(false\)/,
    )
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /goalReached && !showCompletion/)
    assert.match(
      readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"),
      /card\.stepId === "complete"[\s\S]*acknowledgedStepId: "complete"/,
    )
    assert.doesNotMatch(
      readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"),
      /const onAcknowledge[\s\S]*card\.stepId === "complete"[\s\S]*setShowCompletion\(false\)/,
    )
    assert.doesNotMatch(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /writeArchiveOnboardingSnooze/)
    assert.doesNotMatch(readFileSync("src/lib/onboarding/storage.ts", "utf8"), /sessionStorage/)
    assert.match(readFileSync("src/app/author/login/author-login-form.tsx", "utf8"), /USER_HUD_REFRESH_EVENT/)
    assert.match(ratingFormSource, /ARCHIVE_ONBOARDING_RATING_SAVED_EVENT/)
    assert.match(catalogSource, /ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT/)
    assert.equal(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, "zadrotto:rating-saved")
    assert.equal(ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT, "zadrotto:archive-record-focused")
  })

  it("renders the onboarding card in the HUD layer with a future mascot slot and a visible rating coach mark", () => {
    assert.match(layerSource, /<OnboardingHudCard/)
    assert.match(layerSource, /aria-label="Обучение архива"/)
    assert.match(layerSource, /showTools \|\| showOnboardingCard/)
    assert.match(layerSource, /Пользовательские инструменты[\s\S]*Обучение архива/)
    assert.match(cardSource, /ONBOARDING_IMAGE_SLOT_CLASS_NAME/)
    assert.match(demoLoginPromptSource, /ONBOARDING_IMAGE_SLOT_CLASS_NAME/)
    assert.match(demoLoginPromptSource, /ARCHIVE_ONBOARDING_IMAGE_SRC/)
    assert.match(demoLoginPromptSource, /<Image/)
    assert.match(cardSource, /self-stretch/)
    assert.match(cardSource, /h-full w-full object-contain object-bottom/)
    assert.match(cardSource, /card\.imageSrc \?/)
    assert.match(cardSource, /<Image/)
    assert.match(cardSource, /aria-label="Поехали в архив"/)
    assert.match(cardSource, /aria-label="Дальше"/)
    assert.match(cardSource, /ArrowRight/)
    assert.match(cardSource, /rounded-full/)
    assert.match(cardSource, /showAdvance/)
    assert.match(cardSource, /showArchiveLink/)
    assert.match(cardSource, /flex flex-nowrap items-center gap-1\.5/)
    assert.match(cardSource, /showProgress = card\.stepId !== "start" \|\| !archiveHref/)
    assert.match(cardSource, /variant: "outline"/)
    assert.match(layerSource, /archiveHref=\{onboarding\.archiveHref\}/)
    assert.match(layerSource, /onNeverShow=\{onboarding\.onNeverShow\}/)
    assert.match(cardSource, /aria-label="Скрыть подсказку"/)
    assert.match(cardSource, /Больше не показывать/)
    assert.match(cardSource, /card\.stepId !== "achievement"/)
    assert.match(cardSource, /onNeverShow/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /showFirstAchievement/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /ratingsCount > previousRatings && showFirstAchievement/)
    assert.match(modelSource, /stepId: "achievement"/)
    assert.match(cardSource, /aria-label="Свернуть"/)
    assert.match(cardSource, /aria-label="Развернуть"/)
    assert.match(cardSource, /onExpand/)
    assert.match(layerSource, /onExpand=\{onboarding\.onExpand\}/)
    assert.match(readFileSync("src/components/onboarding/use-archive-onboarding.ts", "utf8"), /expandArchiveOnboardingStorage/)
    assert.match(modelSource, /export function expandArchiveOnboardingStorage/)
    assert.doesNotMatch(cardSource, /aria-label="Понятно"/)
    assert.match(cardSource, /\/mascot\/deadz_map\.webp|card\.imageSrc/)
    assert.match(modelSource, /ARCHIVE_ONBOARDING_IMAGE_SRC = "\/mascot\/deadz_map\.webp"/)
    assert.match(coachSource, /ARCHIVE_ONBOARDING_COACH_MARK_TEXT/)
    assert.match(coachSource, /IntersectionObserver/)
    assert.match(ratingDialogSource, /<RatingCoachAnchor>/)
    assert.match(layerSource, /isArchiveOnboardingPath|useArchiveOnboarding/)
  })

  it("requires confirmation before deleting a rating from the rating dialog", () => {
    assert.match(ratingFormSource, /if \(isSelected\) \{[\s\S]*setIsScoreCleared\(true\)/)
    assert.match(ratingFormSource, /value=\{shouldDeleteScore \? "delete" : "save"\}/)
    assert.match(ratingFormSource, /shouldDeleteScore[\s\S]*"Удалить оценку"/)
  })
})
