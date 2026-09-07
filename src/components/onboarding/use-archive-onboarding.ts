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

export function useArchiveOnboarding({
  authorId,
  authenticated,
  pathname,
  ratingsCount,
  ready,
}: {
  authorId: number | null
  authenticated: boolean
  pathname: string
  ratingsCount: number
  ready: boolean
}) {
  const [catalogFocus, setCatalogFocus] = useState({ focused: false, path: pathname })
  const [temporaryHide, setTemporaryHide] = useState({ hidden: false, path: pathname })
  const [showCompletion, setShowCompletion] = useState(false)
  const previousRatingsRef = useRef<number | null>(null)
  if (catalogFocus.path !== pathname) {
    setCatalogFocus({ focused: false, path: pathname })
  }
  if (temporaryHide.path !== pathname) {
    setTemporaryHide({ hidden: false, path: pathname })
  }
  const storageSnapshot = useSyncExternalStore(
    subscribeArchiveOnboardingStorage,
    () => getArchiveOnboardingStorageSnapshot(authorId),
    () => EMPTY_ARCHIVE_ONBOARDING_STORAGE_SNAPSHOT,
  )
  const storage = useMemo(
    () => parseArchiveOnboardingStorage(JSON.parse(storageSnapshot) as unknown),
    [storageSnapshot],
  )
  const recordFocused = isArchiveOnboardingMediaPath(pathname) || catalogFocus.focused
  const reconciled = ready && authenticated && authorId != null
    ? reconcileArchiveOnboardingStorage(storage, ratingsCount)
    : null

  useEffect(() => {
    if (!ready || !authenticated || authorId == null) return

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
          authorId,
        )
      }
      return
    }

    if (
      previousRatings < ARCHIVE_ONBOARDING_GOAL_COUNT
      && ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT
    ) {
      setShowCompletion(true)
    }
  }, [authenticated, authorId, ratingsCount, ready, storage])

  useEffect(() => {
    if (!reconciled || authorId == null) return
    if (
      reconciled.acknowledgedStepId === storage.acknowledgedStepId
      && reconciled.completed === storage.completed
      && reconciled.dismissed === storage.dismissed
      && reconciled.started === storage.started
    ) {
      return
    }

    writeArchiveOnboardingStorage(reconciled, authorId)
  }, [authorId, reconciled, storage])

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
      ratingsCount,
      recordFocused,
      started: reconciled.started,
    })
  }, [pathname, ratingsCount, recordFocused, reconciled, showCompletion, temporaryHide.hidden])

  const collapsed = Boolean(
    card?.canHide && card && reconciled?.acknowledgedStepId === card.stepId,
  )

  const onDismiss = useCallback(() => {
    setTemporaryHide({ hidden: true, path: pathname })
  }, [pathname])

  const onNeverShow = useCallback(() => {
    if (authorId == null) return
    writeArchiveOnboardingStorage(
      dismissArchiveOnboardingStorage(reconciled ?? storage),
      authorId,
    )
  }, [authorId, reconciled, storage])

  const onAcknowledge = useCallback(() => {
    if (!card?.canHide) return
    writeArchiveOnboardingStorage(
      acknowledgeArchiveOnboardingStep(reconciled ?? storage, card.stepId),
      authorId,
    )
    if (card.stepId === "complete") setShowCompletion(false)
  }, [authorId, card, reconciled, storage])

  const onExpand = useCallback(() => {
    if (authorId == null) return
    writeArchiveOnboardingStorage(
      expandArchiveOnboardingStorage(reconciled ?? storage),
      authorId,
    )
  }, [authorId, reconciled, storage])

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
