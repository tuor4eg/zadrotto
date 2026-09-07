"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import {
  acknowledgeArchiveOnboardingStep,
  ARCHIVE_ONBOARDING_GOAL_COUNT,
  ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT,
  dismissArchiveOnboardingStorage,
  expandArchiveOnboardingStorage,
  getArchiveOnboardingCard,
  isArchiveOnboardingMediaPath,
  isArchiveOnboardingPath,
  isArchiveOnboardingRatingPath,
  reconcileArchiveOnboardingStorage,
} from "@/lib/onboarding/model"
import {
  EMPTY_ARCHIVE_ONBOARDING_STORAGE_SNAPSHOT,
  getArchiveOnboardingStorageSnapshot,
  parseArchiveOnboardingStorage,
  subscribeArchiveOnboardingStorage,
  writeArchiveOnboardingStorage,
} from "@/lib/onboarding/storage"
import { DEMO_ONBOARDING_STORAGE_AUTHOR_KEY } from "@/lib/user-state/demo-profile"

export function useArchiveOnboarding({
  authorId,
  authenticated,
  demo = false,
  pathname,
  ratingsCount,
  ready,
}: {
  authorId: number | null
  authenticated: boolean
  demo?: boolean
  pathname: string
  ratingsCount: number
  ready: boolean
}) {
  const storageSubject = authenticated && authorId != null
    ? authorId
    : demo
      ? DEMO_ONBOARDING_STORAGE_AUTHOR_KEY
      : null
  const eligible = Boolean(storageSubject != null)
  const [catalogFocus, setCatalogFocus] = useState({ focused: false, path: pathname })
  const [temporaryHide, setTemporaryHide] = useState({ hidden: false, path: pathname })
  const [showCompletion, setShowCompletion] = useState(false)
  const [showFirstAchievement, setShowFirstAchievement] = useState(false)
  const previousRatingsRef = useRef<number | null>(null)
  const completionPathRef = useRef<string | null>(null)
  if (catalogFocus.path !== pathname) {
    setCatalogFocus({ focused: false, path: pathname })
  }
  if (temporaryHide.path !== pathname) {
    setTemporaryHide({ hidden: false, path: pathname })
  }
  const storageSnapshot = useSyncExternalStore(
    subscribeArchiveOnboardingStorage,
    () => getArchiveOnboardingStorageSnapshot(storageSubject),
    () => EMPTY_ARCHIVE_ONBOARDING_STORAGE_SNAPSHOT,
  )
  const storage = useMemo(
    () => parseArchiveOnboardingStorage(JSON.parse(storageSnapshot) as unknown),
    [storageSnapshot],
  )
  const recordFocused = isArchiveOnboardingMediaPath(pathname) || catalogFocus.focused
  const reconciled = ready && eligible
    ? reconcileArchiveOnboardingStorage(storage, ratingsCount)
    : null

  useEffect(() => {
    if (!ready || !eligible || storageSubject == null) return

    const previousRatings = previousRatingsRef.current
    previousRatingsRef.current = ratingsCount

    if (previousRatings === null) {
      // Page load / first HUD snapshot: if the goal is already met, never show complete.
      if (ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT && !storage.completed) {
        writeArchiveOnboardingStorage(
          {
            ...storage,
            completed: true,
            started: true,
          },
          storageSubject,
        )
      }
      return
    }

    if (
      showCompletion
      && previousRatings >= ARCHIVE_ONBOARDING_GOAL_COUNT
      && ratingsCount > previousRatings
    ) {
      writeArchiveOnboardingStorage(
        {
          ...(reconciled ?? storage),
          completed: true,
          started: true,
        },
        storageSubject,
      )
      setShowCompletion(false)
      completionPathRef.current = null
      return
    }

    if (previousRatings < 1 && ratingsCount >= 1 && ratingsCount < ARCHIVE_ONBOARDING_GOAL_COUNT) {
      setShowFirstAchievement(true)
    }

    if (previousRatings >= 1 && ratingsCount > previousRatings && showFirstAchievement) {
      setShowFirstAchievement(false)
      if (!storage.firstAchievementSeen) {
        writeArchiveOnboardingStorage(
          {
            ...storage,
            firstAchievementSeen: true,
          },
          storageSubject,
        )
      }
    }

    if (
      previousRatings < ARCHIVE_ONBOARDING_GOAL_COUNT
      && ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT
    ) {
      completionPathRef.current = pathname
      setShowCompletion(true)
      setShowFirstAchievement(false)
    }
  }, [eligible, pathname, ratingsCount, ready, reconciled, showCompletion, showFirstAchievement, storage, storageSubject])

  useEffect(() => {
    if (!showCompletion || storageSubject == null) return
    if (completionPathRef.current == null) {
      completionPathRef.current = pathname
      return
    }
    if (completionPathRef.current === pathname) return

    writeArchiveOnboardingStorage(
      {
        ...(reconciled ?? storage),
        completed: true,
        started: true,
      },
      storageSubject,
    )
    setShowCompletion(false)
    completionPathRef.current = null
  }, [pathname, reconciled, showCompletion, storage, storageSubject])

  useEffect(() => {
    if (!reconciled || storageSubject == null) return
    if (
      reconciled.acknowledgedStepId === storage.acknowledgedStepId
      && reconciled.completed === storage.completed
      && reconciled.dismissed === storage.dismissed
      && reconciled.firstAchievementSeen === storage.firstAchievementSeen
      && reconciled.started === storage.started
    ) {
      return
    }

    writeArchiveOnboardingStorage(reconciled, storageSubject)
  }, [reconciled, storage, storageSubject])

  useEffect(() => {
    function handleRecordFocused() {
      setCatalogFocus({ focused: true, path: pathname })
    }

    window.addEventListener(ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT, handleRecordFocused)
    return () => {
      window.removeEventListener(ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT, handleRecordFocused)
    }
  }, [pathname])

  const card = useMemo(() => {
    if (!reconciled || !isArchiveOnboardingPath(pathname) || temporaryHide.hidden) return null

    const goalReached = ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT
    // Show "Архив начат!" only after crossing the goal in this session.
    const completed = reconciled.completed || (goalReached && !showCompletion)

    return getArchiveOnboardingCard({
      completed,
      dismissed: reconciled.dismissed,
      firstAchievementSeen: reconciled.firstAchievementSeen,
      ratingsCount,
      recordFocused,
      showFirstAchievement,
      started: reconciled.started,
    })
  }, [
    pathname,
    ratingsCount,
    recordFocused,
    reconciled,
    showCompletion,
    showFirstAchievement,
    temporaryHide.hidden,
  ])

  const collapsed = Boolean(
    card?.canHide && card && reconciled?.acknowledgedStepId === card.stepId,
  )

  const onDismiss = useCallback(() => {
    if (card?.stepId === "complete" && storageSubject != null) {
      writeArchiveOnboardingStorage(
        acknowledgeArchiveOnboardingStep(reconciled ?? storage, "complete"),
        storageSubject,
      )
      setShowCompletion(false)
      completionPathRef.current = null
      return
    }
    setTemporaryHide({ hidden: true, path: pathname })
  }, [card?.stepId, pathname, reconciled, storage, storageSubject])

  const onNeverShow = useCallback(() => {
    if (storageSubject == null) return
    writeArchiveOnboardingStorage(
      dismissArchiveOnboardingStorage(reconciled ?? storage),
      storageSubject,
    )
  }, [reconciled, storage, storageSubject])

  const onAcknowledge = useCallback(() => {
    if (!card || storageSubject == null) return
    if (card.stepId === "achievement") {
      writeArchiveOnboardingStorage(
        acknowledgeArchiveOnboardingStep(reconciled ?? storage, card.stepId),
        storageSubject,
      )
      setShowFirstAchievement(false)
      return
    }
    if (!card.canHide) return
    if (card.stepId === "complete") {
      writeArchiveOnboardingStorage(
        {
          ...(reconciled ?? storage),
          acknowledgedStepId: "complete",
        },
        storageSubject,
      )
      return
    }
    writeArchiveOnboardingStorage(
      acknowledgeArchiveOnboardingStep(reconciled ?? storage, card.stepId),
      storageSubject,
    )
  }, [card, reconciled, storage, storageSubject])

  const onExpand = useCallback(() => {
    if (storageSubject == null) return
    writeArchiveOnboardingStorage(
      expandArchiveOnboardingStorage(reconciled ?? storage),
      storageSubject,
    )
  }, [reconciled, storage, storageSubject])

  return {
    archiveHref: isArchiveOnboardingRatingPath(pathname) ? null : "/archive",
    card,
    collapsed,
    onAcknowledge,
    onDismiss,
    onExpand,
    onNeverShow,
    showRatingCoachMark: Boolean(card?.showRatingCoachMark && !collapsed),
  }
}
