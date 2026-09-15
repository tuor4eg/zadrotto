import Link from "next/link"

const FOOTER_LINKS = [
  { href: "/about", label: "О проекте" },
  { href: "/rules", label: "Правила" },
  { href: "/help", label: "Помощь" },
] as const

function TelegramIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21.94 2.68a1.5 1.5 0 0 0-1.54-.26L2.86 9.27a1.49 1.49 0 0 0 .08 2.8l4.17 1.43 1.62 5.2a1.5 1.5 0 0 0 2.54.56l2.32-2.38 4.54 3.35a1.5 1.5 0 0 0 2.35-.9l2-15.2a1.5 1.5 0 0 0-.54-1.45ZM9.91 17.15l-1.17-3.76 8.95-6.13-7.78 9.89Z" />
    </svg>
  )
}

export function ArchiveSiteFooter() {
  return (
    <footer className="archive-paper archive-panel flex flex-col items-center gap-2 px-4 py-3 text-stone-600 sm:px-5">
      <div className="flex flex-nowrap items-center justify-center whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] sm:text-[10px] sm:tracking-[0.12em]">
        <span className="px-1.5 first:pl-0 sm:px-3">{new Date().getFullYear()}</span>
        {FOOTER_LINKS.map((item) => (
          <span key={item.href} className="border-l border-stone-400/40 px-1.5 sm:px-3">
            <Link className="hover:text-stone-950" href={item.href}>
              {item.label}
            </Link>
          </span>
        ))}
        <span className="flex items-center border-l border-stone-400/40 px-1.5 sm:px-3">
          <a
            aria-label="Telegram-канал Задротто"
            className="inline-flex text-stone-600 transition-colors hover:text-stone-950"
            href="https://t.me/zadrotto"
            rel="noreferrer"
            target="_blank"
          >
            <TelegramIcon />
          </a>
        </span>
      </div>
      <p className="max-w-3xl text-center font-mono text-[10px] leading-4 tracking-[0.04em] text-stone-500">
        18+ · В отдельных статьях, мнениях и описаниях может встречаться ненормативная лексика
      </p>
    </footer>
  )
}
