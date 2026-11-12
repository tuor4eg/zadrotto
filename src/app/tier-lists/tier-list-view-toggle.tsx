import Link from "next/link"

type TierListCatalogView = "all" | "mine"

export function TierListViewToggle({ view }: { view: TierListCatalogView }) {
  return (
    <nav
      aria-label="Режим списка тир-листов"
      className="inline-flex rounded-md border border-stone-300/80 bg-stone-50/70 p-0.5"
    >
      <Link
        href="/tier-lists"
        aria-current={view === "all" ? "page" : undefined}
        className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
          view === "all"
            ? "bg-stone-900 text-stone-50"
            : "text-stone-700 hover:text-stone-950"
        }`}
      >
        Все тир-листы
      </Link>
      <Link
        href="/tier-lists?view=mine"
        aria-current={view === "mine" ? "page" : undefined}
        className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
          view === "mine"
            ? "bg-stone-900 text-stone-50"
            : "text-stone-700 hover:text-stone-950"
        }`}
      >
        Мои тир-листы
      </Link>
    </nav>
  )
}
