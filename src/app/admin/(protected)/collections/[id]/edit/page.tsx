import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getAdminMediaBrowserFilterOptions } from "@/db/queries/admin-media-browser";
import { getEditorialCollectionById } from "@/db/queries/editorial-collections";
import { getMediaTypeLabel } from "@/lib/media/types";
import { PageHeader } from "../../../admin-ui";
import { toggleCollectionPublicationAction, updateCollectionAction } from "../../actions";
import { CollectionForm } from "../../collection-form";

export default async function EditCollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [collection, options, query] = await Promise.all([getEditorialCollectionById(id), getAdminMediaBrowserFilterOptions(), searchParams]);
  if (!collection) notFound();
  const error = (await query).error;
  const initialBlocks = collection.blocks.map((block) => block.type === "media" ? ({
    clientId: `block-${block.id}`,
    type: "media" as const,
    item: {
      ...block.item,
      mediaTypeLabel: getMediaTypeLabel(block.item.mediaType, options.mediaTypes),
      mediaCarrierName: null,
      franchises: [],
    },
    editorialComment: block.editorialComment ?? "",
  }) : ({
    clientId: `block-${block.id}`,
    type: block.type,
    content: block.content,
  }));
  return <div className="grid gap-5">
    <PageHeader title={collection.title} description={`Публичный адрес: /collections/${collection.slug}`} aside={<div className="flex gap-2"><Link className={buttonVariants({ variant: "outline" })} href="/admin/collections"><ArrowLeft />К списку</Link><Link className={buttonVariants({ variant: "outline" })} href={collection.publicationStatus === "published" ? `/collections/${collection.slug}` : `/admin/collections/${id}/preview`}><Eye />{collection.publicationStatus === "published" ? "Открыть на сайте" : "Предпросмотр"}</Link></div>} />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error === "empty" ? "Нельзя опубликовать пустую подборку." : error === "items-unpublished" ? "Все записи подборки должны быть опубликованы." : "Не удалось изменить статус подборки."}</p> : null}
    <form action={toggleCollectionPublicationAction} className="flex items-center gap-3 rounded-md border bg-white p-4"><input type="hidden" name="collectionId" value={id} /><input type="hidden" name="status" value={collection.publicationStatus === "published" ? "private" : "published"} /><span className="text-sm">Статус: <b>{collection.publicationStatus === "published" ? "опубликована" : "черновик"}</b></span><button className={buttonVariants({ size: "sm", variant: collection.publicationStatus === "published" ? "outline" : "default" })}>{collection.publicationStatus === "published" ? "Снять с публикации" : "Опубликовать"}</button></form>
    <CollectionForm action={updateCollectionAction} initial={{ id, title: collection.title, description: collection.description, coverUrl: collection.coverUrl, blocks: initialBlocks }} mediaTypes={options.mediaTypes} series={options.series} />
  </div>;
}
