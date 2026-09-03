import Link from "next/link";
import { notFound } from "next/navigation";

import { EditorialCollectionView } from "@/components/archive/editorial-collection-view";
import { buttonVariants } from "@/components/ui/button";
import { getEditorialCollectionById } from "@/db/queries/editorial-collections";

export default async function CollectionPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const collection = await getEditorialCollectionById(id);
  if (!collection) notFound();
  return <div className="grid gap-4"><div className="flex items-center justify-between rounded-md border bg-amber-50 p-3 text-sm"><span>Предпросмотр. Эта страница доступна только администратору.</span><Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/collections/${id}/edit`}>Вернуться к редактированию</Link></div><div className="archive-page rounded-md p-3"><EditorialCollectionView collection={collection} currentAuthor={false} /></div></div>;
}
