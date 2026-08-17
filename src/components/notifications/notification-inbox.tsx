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
import { Bell } from "lucide-react"

import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts"
import { buttonVariants } from "@/components/ui/button"
import { NotificationBadge } from "@/components/ui/notification-badge"
import type { NotificationInboxPayload } from "@/lib/notifications/inbox"

const POLL_INTERVAL_MS = 30_000

type NotificationInboxItem = NotificationInboxPayload["items"][number]

type NotificationInboxValue = {
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
    () => ({ items, markRead, unreadCount }),
    [items, markRead, unreadCount],
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

export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const inbox = useContext(NotificationInboxContext)
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
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
        onClick={() => setIsOpen((current) => !current)}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} relative`}
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
            inbox.items.map((item) => (
              item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    setIsOpen(false)
                    if (!item.readAt) void inbox.markRead(item.id)
                  }}
                  className={`block rounded-sm px-3 py-2 text-sm transition-colors hover:bg-stone-200/60 hover:text-stone-950 ${
                    item.readAt ? "text-stone-600" : "font-medium text-stone-950"
                  }`}
                >
                  <span className="block">{item.title}</span>
                  <span className="mt-0.5 block truncate text-stone-600">{item.body}</span>
                </Link>
              ) : (
                <div
                  key={item.id}
                  className={`rounded-sm px-3 py-2 text-sm ${
                    item.readAt ? "text-stone-600" : "font-medium text-stone-950"
                  }`}
                >
                  <span className="block">{item.title}</span>
                  <span className="mt-0.5 block truncate text-stone-600">{item.body}</span>
                </div>
              )
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
