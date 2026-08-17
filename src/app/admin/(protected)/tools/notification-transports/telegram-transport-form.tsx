"use client"

import { useId, useRef, useState, useTransition } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/form"
import type { TelegramTransportAdminState } from "@/lib/notifications/transports/telegram"

import {
  saveTelegramTransportAction,
  testTelegramTransportAction,
  type TelegramTransportTestState,
} from "./actions"

function appendChatId(chatIds: string[], draft: string) {
  const chatId = draft.trim()
  if (!chatId || chatIds.includes(chatId)) return chatIds
  return [...chatIds, chatId]
}

function getTestErrorMessage(error: TelegramTransportTestState["error"]) {
  if (error === "missing-token") return "Сначала сохрани bot token."
  if (error === "decrypt-error") return "Не удалось прочитать сохранённый token. Проверь ключ шифрования."
  if (error === "missing-recipients") return "Сначала добавь получателей и сохрани настройки."
  if (error === "send-failed") return "Telegram не принял тестовое сообщение."
  return null
}

export function TelegramTransportForm({ state }: { state: TelegramTransportAdminState }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [chatIds, setChatIds] = useState(state.chatIds)
  const [draft, setDraft] = useState("")
  const [isTestOpen, setIsTestOpen] = useState(false)
  const [testResult, setTestResult] = useState<TelegramTransportTestState | null>(null)
  const [isTestPending, startTestTransition] = useTransition()

  function commitDraft() {
    setChatIds((current) => appendChatId(current, draft))
    setDraft("")
  }

  function startTest() {
    setTestResult(null)
    setIsTestOpen(true)
    startTestTransition(async () => {
      setTestResult(await testTelegramTransportAction())
    })
  }

  return (
    <>
      <form action={saveTelegramTransportAction} className="grid gap-4 rounded-md border bg-white p-5">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="enabled" value="1" defaultChecked={state.enabled} />
          Включён
        </label>
        <div className="grid gap-2">
          <Label htmlFor="botToken">Bot token</Label>
          <Input
            id="botToken"
            name="botToken"
            type="password"
            autoComplete="off"
            placeholder={state.botTokenHint ?? "токен бота"}
          />
          <p className="text-xs text-stone-500">
            Оставь поле пустым, чтобы сохранить текущий токен. После смены ключа шифрования введи токен заново.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="chatIds-draft">Получатели</Label>
          {chatIds.map((chatId) => (
            <input key={chatId} type="hidden" name="chatIds" value={chatId} />
          ))}
          <div
            className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-1.5 shadow-xs focus-within:border-stone-400"
            onClick={() => inputRef.current?.focus()}
          >
            {chatIds.map((chatId) => (
              <Badge key={chatId} variant="default" className="gap-1 pr-1">
                <span>{chatId}</span>
                <button
                  type="button"
                  aria-label={`Удалить получателя ${chatId}`}
                  className="grid size-4 place-items-center rounded-sm text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                  onClick={(event) => {
                    event.stopPropagation()
                    setChatIds((current) => current.filter((item) => item !== chatId))
                  }}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
            <input
              ref={inputRef}
              id="chatIds-draft"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              placeholder={chatIds.length === 0 ? "-1001234567890" : undefined}
              className="min-w-24 flex-1 border-0 bg-transparent px-1 text-sm text-stone-950 outline-none placeholder:text-stone-400"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                commitDraft()
              }}
            />
          </div>
          <p className="text-xs text-stone-500">
            Числовой ID пользователя, группы или канала. Клик вне поля сохраняет id как тег. Для включения транспорта нужен хотя бы один получатель.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Сохранить</Button>
          <Button type="button" variant="outline" onClick={startTest}>
            Тест
          </Button>
        </div>
      </form>
      {isTestOpen ? (
        <TelegramTransportTestModal
          isPending={isTestPending}
          result={testResult}
          onClose={() => setIsTestOpen(false)}
        />
      ) : null}
    </>
  )
}

function TelegramTransportTestModal({
  isPending,
  onClose,
  result,
}: {
  isPending: boolean
  onClose: () => void
  result: TelegramTransportTestState | null
}) {
  const titleId = useId()
  const descriptionId = useId()
  const errorMessage = result ? getTestErrorMessage(result.error) : null
  const status = result
    ? result.ok
      ? {
          title: "Сообщение отправлено",
          description: "Telegram принял тестовое сообщение для всех получателей.",
          className: "border-emerald-200 bg-emerald-50 text-emerald-900",
        }
      : {
          title: "Проверка не пройдена",
          description: errorMessage ?? "Telegram вернул ошибку.",
          className: "border-amber-200 bg-amber-50 text-amber-900",
        }
    : null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть окно проверки"
        disabled={isPending}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
      >
        <div>
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            Проверка · Telegram
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">
            Отправляем тестовое сообщение по сохранённым настройкам.
          </p>
        </div>

        {isPending ? (
          <div className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
            <LoaderCircle className="size-5 animate-spin" />
            Отправляем тестовое сообщение…
          </div>
        ) : status ? (
          <div className={`grid gap-2 rounded-md border p-4 text-sm ${status.className}`}>
            <div className="font-medium">{status.title}</div>
            <p className="leading-6">{status.description}</p>
            {result?.results.length ? (
              <ul className="grid gap-1.5">
                {result.results.map((item) => (
                  <li key={item.chatId} className="break-words font-mono text-xs leading-5">
                    {item.chatId}: {item.ok ? "ок" : item.error ?? "ошибка"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" disabled={isPending} onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  )
}
