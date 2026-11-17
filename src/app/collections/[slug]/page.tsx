import { buildPublicPageMetadata, NO_INDEX_METADATA } from "@/lib/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { EditorialCollectionView } from "@/components/archive/editorial-collection-view";
import { getPublishedEditorialCollectionBySlug } from "@/db/queries/editorial-collections";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const collection = await getPublishedEditorialCollectionBySlug((await params).slug);
  if (!collection) return NO_INDEX_METADATA;
  return buildPublicPageMetadata(
    `/collections/${encodeURIComponent(collection.slug)}`,
    collection.title,
    collection.description || `Подборка «${collection.title}» в Гикотеке. Открывай произведения, читай рецензии и пополняй свой архив.`,
    collection.coverUrl,
  );
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { author, headerProps: headerState } = await getPublicSiteHeaderState();
  const collection = await getPublishedEditorialCollectionBySlug((await params).slug, author?.id);
  if (!collection) notFound();
  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3"><PublicSiteHeader {...headerState} /><div className="w-full"><EditorialCollectionView collection={collection} currentAuthor={Boolean(author)} ratingAuthor={author ? { name: author.name, code: author.code } : null} /></div></div></main>;
}
