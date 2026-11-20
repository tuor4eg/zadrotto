"use client"

import { useEffect, useId, useImperativeHandle, useRef, useState } from "react"
import { EditorContent, ReactRenderer, useEditor, useEditorState } from "@tiptap/react"
import { Markdown } from "@tiptap/markdown"
import type { SuggestionProps } from "@tiptap/suggestion"
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Link2, Undo2, Redo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/form"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import type { MentionSuggestion } from "@/lib/inline-mentions/markup"
import { getMentionTriggerConfig } from "@/lib/inline-mentions/registry"
import { ReviewMention, isReviewLinkAllowed, reviewStarterKit, reviewBodyToDocument, reviewDocumentToMarkdown, updateReviewMentionLabel, type ReviewBodyFormat } from "@/lib/reviews/body"

type MentionListHandle = { onKeyDown: (event: KeyboardEvent) => boolean }

function MentionList({ items, command, editor, query, loading, ref }: SuggestionProps<MentionSuggestion> & { ref: React.Ref<MentionListHandle> }) {
  const [selection, setSelection] = useState({ query, index: 0 })
  const index = selection.query === query ? selection.index : 0
  const listboxId = useId()
  useEffect(() => {
    const input = editor.view.dom
    input.setAttribute("aria-controls", listboxId)
    input.setAttribute("aria-expanded", "true")
    if (items.length && !loading) input.setAttribute("aria-activedescendant", `${listboxId}-${Math.min(index, items.length - 1)}`)
    else input.removeAttribute("aria-activedescendant")
    return () => {
      input.removeAttribute("aria-controls")
      input.removeAttribute("aria-expanded")
      input.removeAttribute("aria-activedescendant")
    }
  }, [editor, index, items.length, listboxId, loading])
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (loading) return false
      if (["ArrowUp", "ArrowDown"].includes(event.key) && items.length) {
        setSelection({ query, index: (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length })
        return true
      }
      if (["Enter", "Tab"].includes(event.key) && items.length) {
        command(items[Math.min(index, items.length - 1)])
        return true
      }
      return false
    },
  }), [command, index, items, query, loading])
  return <div id={listboxId} role="listbox" aria-label="Записи архива" aria-busy={loading} className="max-h-64 overflow-y-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg">
    {loading ? <p className="px-3 py-2 text-sm text-stone-500">Ищем…</p> : items.length ? items.map((item, itemIndex) => <Button
      id={`${listboxId}-${itemIndex}`} key={`${item.type}:${item.id}`} role="option" aria-selected={itemIndex === Math.min(index, items.length - 1)}
      className={`h-auto w-full justify-start py-2 text-left ${itemIndex === Math.min(index, items.length - 1) ? "bg-stone-100" : ""}`}
      variant="ghost" onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setSelection({ query, index: itemIndex })} onClick={() => command(item)}
    >
      <ImageWithFallback src={item.image} alt="" className="size-9 shrink-0 rounded object-cover" fallback={<span className="size-9 shrink-0 rounded bg-stone-100" />} />
      <span className="min-w-0"><span className="block truncate">{item.label}</span><span className="block truncate text-xs font-normal text-stone-500">{item.subtitle}</span></span>
    </Button>) : <p className="px-3 py-2 text-sm text-stone-500">Ничего не найдено</p>}
  </div>
}

function mentionExtension(onError: (error: string | null) => void) {
  let controller: AbortController | undefined
  return ReviewMention.configure({
    suggestion: {
      char: "@",
      allowSpaces: true,
      allowedPrefixes: [" ", "\n", "(", "[", "{", "—", "–", "«", '"', "'"],
      allow: ({ state, range }) => state.doc.textBetween(range.from + 1, range.to).trim().length >= 2,
      items: async ({ query }) => {
        controller?.abort()
        if (query.trim().length < 2) return []
        const request = new AbortController()
        controller = request
        onError(null)
        try {
          await new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, 250)
            request.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve() }, { once: true })
          })
          if (request.signal.aborted) return []
          const endpoint = getMentionTriggerConfig("@")!.searchEndpoint
          const response = await fetch(`${endpoint}?${new URLSearchParams({ q: query.trim(), trigger: "@" })}`, { signal: request.signal })
          if (!response.ok) throw new Error(response.status === 401 ? "Сессия истекла. Обновите страницу и войдите снова." : "Не удалось найти записи. Попробуйте ещё раз.")
          return ((await response.json()) as { items: MentionSuggestion[] }).items
        } catch (error) {
          if (!request.signal.aborted) onError(error instanceof Error ? error.message : "Не удалось найти записи.")
          return []
        }
      },
      command: ({ editor, range, props }) => {
        const item = props as unknown as MentionSuggestion
        editor.chain().focus().insertContentAt(range, { type: "mention", attrs: { entityType: item.type, id: item.id, label: item.label } }).run()
      },
      render: () => {
        let renderer: ReactRenderer<MentionListHandle> | undefined
        let unmount: (() => void) | undefined
        function close() { unmount?.(); unmount = undefined; renderer?.destroy(); renderer = undefined; controller?.abort() }
        return {
          onStart: (props) => {
            renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
            renderer.element.className = "z-[130] w-[calc(100vw_-_1.5rem)] max-w-[360px]"
            unmount = props.mount(renderer.element as HTMLElement)
          },
          onUpdate: (props) => { renderer?.updateProps(props) },
          onKeyDown: ({ event }) => {
            if (event.key === "Escape") { close(); return true }
            return renderer?.ref?.onKeyDown(event) ?? false
          },
          onExit: close,
        }
      },
    },
  })
}

export default function ReviewEditor({ value, format, onValueChange }: {
  value: string
  format: ReviewBodyFormat
  onValueChange: (value: string, format: ReviewBodyFormat) => void
}) {
  const [searchError, setSearchError] = useState<string | null>(null)
  const lastValue = useRef({ value, format })
  const onChange = useRef(onValueChange)
  useEffect(() => { onChange.current = onValueChange }, [onValueChange])
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [reviewStarterKit, mentionExtension(setSearchError), Markdown.configure({ markedOptions: { gfm: true, breaks: true } })],
    content: reviewBodyToDocument(value, format),
    editorProps: {
      handleClickOn: (_view, _position, node, nodePosition, _event, direct) => {
        if (!direct || node.type.name !== "mention") return false
        openMentionLink(nodePosition)
        return true
      },
      attributes: { id: "body", role: "textbox", "aria-label": "Текст рецензии", "aria-multiline": "true", class: "min-h-64 h-[calc(100dvh-30rem)] overflow-y-auto px-3 py-2 outline-none [&_p]:min-h-[1lh] [&_p]:m-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-stone-300 [&_blockquote]:pl-4 [&_a]:text-red-950 [&_a]:underline" },
    },
    onCreate: ({ editor }) => {
      const body = reviewDocumentToMarkdown(editor.getJSON())
      lastValue.current = { value: body, format: "markdown" }
      onChange.current(body, "markdown")
    },
    onUpdate: ({ editor }) => {
      const body = reviewDocumentToMarkdown(editor.getJSON())
      lastValue.current = { value: body, format: "markdown" }
      onChange.current(body, "markdown")
    },
  })
  const active = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive("bold"), italic: editor?.isActive("italic"), strike: editor?.isActive("strike"),
    bulletList: editor?.isActive("bulletList"), orderedList: editor?.isActive("orderedList"), blockquote: editor?.isActive("blockquote"), link: editor?.isActive("link"),
    canUndo: editor?.can().undo() ?? false, canRedo: editor?.can().redo() ?? false,
  }) })
  useEffect(() => {
    if (!editor || (lastValue.current.value === value && lastValue.current.format === format)) return
    editor.commands.setContent(reviewBodyToDocument(value, format), { emitUpdate: false })
    const body = reviewDocumentToMarkdown(editor.getJSON())
    lastValue.current = { value: body, format: "markdown" }
    onChange.current(body, "markdown")
  }, [editor, value, format])

  const dialog = useRef<HTMLDialogElement>(null)
  const range = useRef({ from: 0, to: 0 })
  const [linkUrl, setLinkUrl] = useState("")
  const [linkText, setLinkText] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)
  const [mentionPosition, setMentionPosition] = useState<number | null>(null)
  function openMentionLink(position: number) {
    if (!editor) return
    const node = editor.state.doc.nodeAt(position)
    if (node?.type.name !== "mention") return
    editor.commands.setNodeSelection(position)
    range.current = { from: position, to: position + node.nodeSize }
    setMentionPosition(position)
    setLinkText(node.attrs.label ?? "")
    setLinkError(null)
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>("#review-link-text")?.focus()
  }
  function openLink() {
    if (!editor) return
    const selectedNode = editor.state.doc.nodeAt(editor.state.selection.from)
    if (selectedNode?.type.name === "mention" && editor.state.selection.to - editor.state.selection.from === selectedNode.nodeSize) {
      openMentionLink(editor.state.selection.from)
      return
    }
    editor.chain().focus().extendMarkRange("link").run()
    range.current = { from: editor.state.selection.from, to: editor.state.selection.to }
    let hasMention = false
    editor.state.doc.nodesBetween(range.current.from, range.current.to, (node) => { if (node.type.name === "mention") hasMention = true })
    if (hasMention) { setSearchError("Ссылка на запись уже добавлена. Для внешней ссылки выберите обычный текст."); return }
    setMentionPosition(null)
    setLinkUrl(editor.getAttributes("link").href ?? "")
    setLinkText(editor.state.doc.textBetween(range.current.from, range.current.to, " "))
    setLinkError(null)
    dialog.current?.showModal()
    dialog.current?.querySelector("input")?.focus()
  }
  function saveLink() {
    if (!editor) return
    if (mentionPosition !== null) {
      if (!linkText.trim()) { setLinkError("Введите текст ссылки."); return }
      editor.chain().focus().command(({ tr }) => updateReviewMentionLabel(tr, mentionPosition, linkText)).run()
      dialog.current?.close()
      return
    }
    if (!isReviewLinkAllowed(linkUrl.trim())) { setLinkError("Укажите полный адрес ссылки с http:// или https://."); return }
    const { from, to } = range.current
    editor.chain().focus().insertContentAt({ from, to }, { type: "text", text: linkText.trim() || linkUrl.trim(), marks: [{ type: "link", attrs: { href: linkUrl.trim() } }] }).run()
    dialog.current?.close()
  }
  const controls = [
    { title: "Жирный", icon: Bold, active: active?.bold, run: () => editor?.chain().focus().toggleBold().run() },
    { title: "Курсив", icon: Italic, active: active?.italic, run: () => editor?.chain().focus().toggleItalic().run() },
    { title: "Зачёркнутый", icon: Strikethrough, active: active?.strike, run: () => editor?.chain().focus().toggleStrike().run() },
    { title: "Маркированный список", icon: List, active: active?.bulletList, run: () => editor?.chain().focus().toggleBulletList().run() },
    { title: "Нумерованный список", icon: ListOrdered, active: active?.orderedList, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { title: "Цитата", icon: Quote, active: active?.blockquote, run: () => editor?.chain().focus().toggleBlockquote().run() },
  ]
  return <>
    <div className="rounded-md border border-stone-200 bg-white text-sm leading-7 focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-900/10">
      <div role="group" aria-label="Форматирование текста" className="flex flex-wrap gap-1 border-b border-stone-200 p-1">
        {controls.map(({ title, icon: Icon, active, run }) => <Button key={title} title={title} aria-label={title} aria-pressed={Boolean(active)} size="icon" variant={active ? "secondary" : "ghost"} disabled={!editor} onClick={run}><Icon /></Button>)}
        <Button title="Ссылка" aria-label="Ссылка" aria-pressed={Boolean(active?.link)} size="icon" variant={active?.link ? "secondary" : "ghost"} disabled={!editor} onClick={openLink}><Link2 /></Button>
        <Button title="Отменить" aria-label="Отменить" size="icon" variant="ghost" disabled={!active?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></Button>
        <Button title="Повторить" aria-label="Повторить" size="icon" variant="ghost" disabled={!active?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></Button>
      </div>
      <EditorContent editor={editor} />
    </div>
    {searchError ? <p role="status" className="text-xs text-red-700">{searchError}</p> : null}
    <dialog ref={dialog} aria-labelledby="review-link-title" className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl backdrop:bg-stone-950/45" onClose={() => editor?.commands.focus()} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); saveLink() } }}>
      <h2 id="review-link-title" className="mb-4 text-lg font-semibold">{mentionPosition !== null ? "Ссылка на запись" : "Ссылка"}</h2>
      <div className="grid gap-2">{mentionPosition === null ? <><Label htmlFor="review-link-url">Адрес</Label><Input id="review-link-url" type="url" placeholder="https://" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} /></> : null}
        <Label htmlFor="review-link-text">Текст ссылки</Label><Input id="review-link-text" value={linkText} onChange={(event) => setLinkText(event.target.value)} />
        {linkError ? <p role="alert" className="text-sm text-red-700">{linkError}</p> : null}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {active?.link ? <Button variant="ghost" onClick={() => { editor?.chain().focus().setTextSelection(range.current).unsetLink().run(); dialog.current?.close() }}>Убрать ссылку</Button> : null}
        <Button variant="outline" onClick={() => dialog.current?.close()}>Отмена</Button><Button onClick={saveLink}>Сохранить</Button>
      </div>
    </dialog>
  </>
}
