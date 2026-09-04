"use client"

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Trash2 } from "lucide-react"

import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts"
import { buttonVariants } from "@/components/ui/button"
import { NotificationBadge } from "@/components/ui/notification-badge"
import { cn } from "@/lib/common/utils"
import type { NotificationInboxPayload } from "@/lib/notifications/inbox"

const POLL_INTERVAL_MS = 30_000

type NotificationInboxItem = NotificationInboxPayload["items"][number]

type NotificationInboxValue = {
  deleteAll: () => Promise<void>
  deleteOne: (id: number) => Promise<void>
  items: NotificationInboxItem[]
  markRead: (id: number) => Promise<void>
  unreadCount: number
}

const NotificationInboxContext = createContext<NotificationInboxValue | null>(null)

function getNotificationsApiBase(isAdminRoute: boolean) {
  return isAdminRoute ? "/api/admin/notifications" : "/api/notifications"
}

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")
  const [items, setItems] = useState<NotificationInboxItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toastMessages, setToastMessages] = useState<ArchiveToast[]>([])
  const authenticatedRef = useRef<boolean | null>(null)
  const requestPendingRef = useRef(false)
  const seenIdsRef = useRef(new Set<number>())
  const isBaselineRef = useRef(true)
  const audienceRef = useRef(isAdminRoute)

  const markRead = useCallback(async (id: number) => {
    const apiBase = getNotificationsApiBase(audienceRef.current)
    try {
      await fetch(`${apiBase}/${id}/read`, {
        cache: "no-store",
        credentials: "same-origin",
        method: "POST",
      })
    } catch {
      return
    }

    setItems((current) =>
      current.map((item) => item.id === id && !item.readAt
        ? { ...item, readAt: new Date().toISOString() }
        : item),
    )
    setUnreadCount((current) => Math.max(0, current - 1))
  }, [])

  const checkNotifications = useCallback(async () => {
    if (requestPendingRef.current || document.visibilityState !== "visible") {
      return
    }

    requestPendingRef.current = true

    try {
      const response = await fetch(getNotificationsApiBase(audienceRef.current), {
        cache: "no-store",
        credentials: "same-origin",
      })
      const data = (await response.json()) as NotificationInboxPayload
      authenticatedRef.current = data.authenticated

      if (!data.authenticated) {
        setItems([])
        setUnreadCount(0)
        return
      }

      setItems(data.items)
      setUnreadCount(data.unreadCount)

      if (isBaselineRef.current) {
        seenIdsRef.current = new Set(data.items.map((item) => item.id))
        isBaselineRef.current = false
        return
      }

      const freshItems = data.items.filter((item) => !seenIdsRef.current.has(item.id))
      for (const item of freshItems) {
        seenIdsRef.current.add(item.id)
      }

      if (freshItems.length > 0) {
        setToastMessages(
          freshItems.slice(0, 3).map((item) => ({
            id: `notification-${item.id}`,
            link: item.href
              ? {
                  href: item.href,
                  label: item.title,
                  onClick: () => {
                    void markRead(item.id)
                  },
                }
              : undefined,
            text: item.body,
            tone: "success",
          })),
        )
      }
    } catch {
      // The next visible poll will retry; notifications stay in the inbox.
    } finally {
      requestPendingRef.current = false
    }
  }, [markRead])

  const deleteOne = useCallback(async (id: number) => {
    const apiBase = getNotificationsApiBase(audienceRef.current)
    setItems((current) => current.filter((item) => item.id !== id))
    try {
      await fetch(`${apiBase}/${id}`, {
        cache: "no-store",
        credentials: "same-origin",
        method: "DELETE",
      })
    } catch {
      // The inbox refresh below restores the current server list.
    }
    await checkNotifications()
  }, [checkNotifications])

  const deleteAll = useCallback(async () => {
    const apiBase = getNotificationsApiBase(audienceRef.current)
    setItems([])
    setUnreadCount(0)
    try {
      await fetch(apiBase, {
        cache: "no-store",
        credentials: "same-origin",
        method: "DELETE",
      })
    } catch {
      // The inbox refresh below restores the current server list.
    }
    await checkNotifications()
  }, [checkNotifications])

  useEffect(() => {
    if (audienceRef.current !== isAdminRoute) {
      audienceRef.current = isAdminRoute
      authenticatedRef.current = null
      isBaselineRef.current = true
      seenIdsRef.current = new Set()
      setItems([])
      setUnreadCount(0)
      setToastMessages([])
    }

    const timeoutId = window.setTimeout(() => void checkNotifications(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [checkNotifications, isAdminRoute, pathname])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (authenticatedRef.current) {
        void checkNotifications()
      }
    }, POLL_INTERVAL_MS)
    const onFocus = () => void checkNotifications()
    window.addEventListener("focus", onFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [checkNotifications, isAdminRoute])

  const value = useMemo<NotificationInboxValue>(
    () => ({
      deleteAll,
      deleteOne,
      items,
      markRead,
      unreadCount,
    }),
    [deleteAll, deleteOne, items, markRead, unreadCount],
  )

  return (
    <NotificationInboxContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <ArchiveToasts messages={toastMessages} />
      </Suspense>
    </NotificationInboxContext.Provider>
  )
}

export function NotificationBell({
  align = "left",
  round = false,
}: {
  align?: "left" | "right"
  round?: boolean
}) {
  const inbox = useContext(NotificationInboxContext)
  const [isOpen, setIsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function closeInbox() {
    setIsOpen(false)
    setConfirmClear(false)
  }

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeInbox()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeInbox()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  if (!inbox) return null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-label="Уведомления"
        onClick={() => {
          if (isOpen) {
            closeInbox()
            return
          }
          setIsOpen(true)
        }}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "relative",
          round && "size-8 rounded-full p-0 hover:bg-stone-200",
        )}
      >
        <Bell className="size-4" />
        <NotificationBadge
          count={inbox.unreadCount}
          className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4"
        />
      </button>
      {isOpen ? (
        <div
          className={`archive-paper-surface absolute top-full z-[60] mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-stone-300 bg-white p-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {inbox.items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-600">Уведомлений нет.</p>
          ) : (
            <>
              <div className="flex justify-end border-b border-stone-200 px-2 py-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmClear) {
                      setConfirmClear(true)
                      return
                    }
                    setConfirmClear(false)
                    void inbox.deleteAll()
                  }}
                  className="rounded-sm px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-200/60 hover:text-red-700"
                >
                  {confirmClear ? "Точно удалить все?" : "Удалить все"}
                </button>
              </div>
              <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain">
                {inbox.items.map((item) => {
              const isMuted = Boolean(item.readAt || item.statusLabel)
              const content = (
                <>
                  <span className="block">{item.title}</span>
                  <span className="mt-0.5 block truncate text-stone-600">{item.body}</span>
                  {item.statusLabel ? (
                    <span className="mt-0.5 block text-xs text-stone-500">{item.statusLabel}</span>
                  ) : null}
                </>
              )
              const className = `min-w-0 flex-1 rounded-sm px-3 py-2 text-sm ${
                isMuted ? "text-stone-600" : "font-medium text-stone-950"
              }`

              return (
                <div key={item.id} className="flex items-start gap-0.5">
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => {
                        closeInbox()
                        if (!item.readAt) void inbox.markRead(item.id)
                      }}
                      className={`block transition-colors hover:bg-stone-200/60 hover:text-stone-950 ${className}`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={className}>
                      {content}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Удалить уведомление «${item.title}»`}
                    onClick={() => void inbox.deleteOne(item.id)}
                    className="mt-1 mr-1 shrink-0 rounded-sm p-1 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-red-700"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
              })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
