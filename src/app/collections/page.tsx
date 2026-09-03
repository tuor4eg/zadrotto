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
  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7"><div className="mx-auto grid w-full max-w-6xl gap-4"><ArchiveSiteHeader brandHref="/" currentAdminUser={Boolean(admin)} currentAuthor={Boolean(author)} variant="main" /><section className="archive-paper archive-panel p-5 sm:p-7"><h1 className="font-serif text-4xl">Подборки</h1><p className="mt-2 text-sm text-stone-600">Редакционные маршруты по архиву.</p><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Link key={item.id} href={`/collections/${item.slug}`} className="group overflow-hidden rounded-md border border-stone-950/10 bg-stone-50 shadow-sm"><div className="relative aspect-video bg-[linear-gradient(135deg,#d9d1bd,#f2ead7)]">{item.coverUrl ? <Image fill unoptimized className="object-cover transition-transform group-hover:scale-[1.02]" alt="" src={item.coverUrl} /> : null}</div><div className="p-4"><h2 className="font-serif text-2xl leading-tight">{item.title}</h2>{item.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{item.description}</p> : null}<p className="mt-3 font-mono text-xs uppercase tracking-wider text-stone-500">{item.itemsCount} записей</p></div></Link>)}{items.length === 0 ? <p className="text-sm text-stone-500">Опубликованных подборок пока нет.</p> : null}</div></section></div></main>;
}
