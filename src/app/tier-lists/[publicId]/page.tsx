import Link from 'next/link';
import { Edit3 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { getTierList, getTierViewerItems } from '@/db/queries/tier-lists';
import { tierBackground, tierForeground, tierEntryIds, visibleTierLevels } from '@/lib/tier-lists/model';
import { EditorialEntryGroupTile } from '@/components/archive/editorial-entry-group-tile';
import { TierExportControls } from '@/components/tier-lists/export-controls';
import { CopyTierLink } from '../copy-link';
export default async function PublicTierListPage({params}:{params:Promise<{publicId:string}>}) {
  const {publicId}=await params;
  const author=await getCurrentAuthor();
  const entry=await getTierList(publicId,author?.id);if(!entry)notFound();
  const {document,authorName,authorAvatarObjectKey}=entry;
  const entries=await getTierViewerItems(tierEntryIds(document.distribution),author?.id);
  const items=entries.map(entry=>entry.item);
  const byId=new Map(entries.map(entry=>[entry.item.id,entry]));
  return <div className="grid gap-5 p-4 sm:p-6"><header><nav aria-label="Хлебные крошки" className="media-carrier-font-pc-steam mb-2 break-words text-xs lowercase text-stone-600"><Link href="/tier-lists" className="hover:text-red-950">Тир-листы</Link><span aria-hidden="true"> / </span><span aria-current="page">{document.title}</span></nav><div className="mt-2 flex flex-wrap items-start gap-x-2 gap-y-4"><div className="flex w-full min-w-0 items-start gap-2 lg:w-auto"><h1 className="mr-2 min-w-0 break-words text-3xl font-bold">{document.title}</h1><CopyTierLink publicId={publicId} title={document.title} />{author?.id===document.authorId?<Link href={`/tier-lists/${publicId}/edit`} aria-label="Редактировать" title="Редактировать" className={`${buttonVariants({ variant: 'outline', size: 'icon' })} shrink-0`}><Edit3 className="size-4" /></Link>:null}</div><div className="w-full min-w-0 max-w-full lg:w-auto lg:flex-1"><TierExportControls title={document.title} configuration={document.configuration} distribution={document.distribution} items={items} trailingContent={<Link href={`/tier-lists?author=${document.authorId}`} className="flex max-w-full items-center justify-end gap-2 text-sm hover:underline"><span className="min-w-0 break-words">{authorName}</span><Avatar name={authorName} objectKey={authorAvatarObjectKey} className="size-9" /></Link>}/></div></div></header><div className="overflow-hidden border border-black divide-y divide-black">{visibleTierLevels(document.configuration,document.distribution).map(level=><section key={level.id} className="overflow-hidden sm:flex"><h2 style={{backgroundColor:level.color}} className="flex shrink-0 items-center justify-center break-words border-b border-black p-3 font-bold text-stone-950 sm:w-24 sm:border-r sm:border-b-0">{level.name}</h2><div style={{ backgroundColor: tierBackground(document.configuration), color: tierForeground(document.configuration) }} className="flex flex-1 flex-wrap items-start gap-3 p-3">{document.distribution[level.id].map(id=>{const item=byId.get(id);return item?<div key={id} className="w-32 min-w-0 sm:w-36 [&_a.group]:border-0"><EditorialEntryGroupTile {...item} currentAuthor={Boolean(author)} ratingAuthor={author ? { name: author.name, code: author.code } : null} horizontalScroll={false} showMetadata={false} showDemoRating={false} /></div>:null;})}</div></section>)}</div></div>;
}
