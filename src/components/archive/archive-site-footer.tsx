import Link from "next/link"

const FOOTER_LINKS = [
  { href: "/about", label: "О проекте" },
  { href: "/rules", label: "Правила" },
  { href: "/help", label: "Помощь" },
  { href: "/feedback", label: "Обратная связь" },
] as const

export function ArchiveSiteFooter() {
  return (
    <footer className="archive-paper archive-panel flex flex-col items-center gap-2 px-4 py-3 text-stone-600 sm:px-5">
      <div className="flex flex-wrap items-center justify-center gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className="px-3 first:pl-0">{new Date().getFullYear()}</span>
        {FOOTER_LINKS.map((item) => (
          <span key={item.href} className="border-l border-stone-400/40 px-3">
            <Link className="hover:text-stone-950" href={item.href}>
              {item.label}
            </Link>
          </span>
        ))}
      </div>
      <p className="max-w-3xl text-center font-mono text-[10px] leading-4 tracking-[0.04em] text-stone-500">
        18+ · В отдельных статьях, мнениях и описаниях может встречаться ненормативная лексика
      </p>
    </footer>
  )
}
