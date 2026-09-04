import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { EditorialCollectionView } from "@/components/archive/editorial-collection-view";
import { getPublishedEditorialCollectionBySlug } from "@/db/queries/editorial-collections";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const collection = await getPublishedEditorialCollectionBySlug((await params).slug);
  if (!collection) return {};
  return { title: collection.title, description: collection.description, openGraph: { title: collection.title, description: collection.description ?? undefined, images: collection.coverUrl ? [collection.coverUrl] : undefined } };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { author, headerProps: headerState } = await getPublicSiteHeaderState();
  const collection = await getPublishedEditorialCollectionBySlug((await params).slug, author?.id);
  if (!collection) notFound();
  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3"><PublicSiteHeader {...headerState} /><div className="mx-auto w-full max-w-6xl"><EditorialCollectionView collection={collection} currentAuthor={Boolean(author)} /></div></div></main>;
}
