import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import { getPublishedEditorialCollections } from "@/db/queries/editorial-collections";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export const metadata: Metadata = { title: "Подборки", description: "Редакционные подборки записей архива." };
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const [items, author, admin] = await Promise.all([getPublishedEditorialCollections(), getCurrentAuthor(), getCurrentAdminUser()]);
  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7"><div className="mx-auto grid w-full max-w-[1480px] gap-4"><ArchiveSiteHeader brandHref="/" currentAdminUser={Boolean(admin)} currentAuthor={Boolean(author)} variant="main" /><section className="archive-paper archive-panel p-5 sm:p-7"><h1 className="font-serif text-4xl">Подборки</h1><p className="mt-2 text-sm text-stone-600">Редакционные маршруты по архиву.</p><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Link key={item.id} href={`/collections/${item.slug}`} className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-stone-900 shadow-md">{item.coverUrl ? <Image fill unoptimized src={item.coverUrl} alt="" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#44403c,#1c1917)]" />}<span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" /><span className="absolute inset-x-0 bottom-0 p-3 text-white"><span className="block truncate text-lg font-semibold leading-tight drop-shadow">{item.title}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-stone-300">{item.itemsCount} записей</span></span></Link>)}{items.length === 0 ? <p className="text-sm text-stone-500">Опубликованных подборок пока нет.</p> : null}</div></section></div></main>;
}
