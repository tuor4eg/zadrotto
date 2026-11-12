import Link from 'next/link'
import { notFound } from 'next/navigation';
import { requireAuthorSession } from '@/lib/auth/author-auth';
import { getTierList, getTierTemplates, getTierListSettings, getTierItems } from '@/db/queries/tier-lists';
import { getAccessibleMediaTypeOptions } from '@/db/queries/media-types';
import { tierEntryIds } from '@/lib/tier-lists/model';
import { TierListEditor } from '../../editor';
export const metadata={title:'Редактировать тир-лист',robots:{index:false,follow:false}};
export default async function EditTierListPage({params}:{params:Promise<{publicId:string}>}) {
  const {author}=await requireAuthorSession();
  const {publicId}=await params;
  const entry=await getTierList(publicId,author.id,true);if(!entry)notFound();
  const [templates,limits,items,mediaTypes]=await Promise.all([getTierTemplates(),getTierListSettings(),getTierItems(tierEntryIds(entry.document.distribution),author.id,author.id),getAccessibleMediaTypeOptions(author.id)]);
  return <div className="p-4 sm:p-6"><nav aria-label="Хлебные крошки" className="mb-2 break-words text-xs lowercase text-stone-600"><Link href="/tier-lists" className="hover:text-red-950">Тир-листы</Link><span aria-hidden="true"> / </span><span aria-current="page">{entry.document.title}</span></nav><h1 className="mb-4 text-2xl font-bold">Редактировать тир-лист</h1>{entry.document.hiddenAt?<p role="status" className="mb-4 rounded bg-amber-50 p-3">Администратор скрыл этот тир-лист. Он недоступен по публичной ссылке.</p>:null}<TierListEditor key={entry.document.publicId} templates={templates} limits={limits} authenticated currentAuthorId={author.id} initial={entry.document} items={items} mediaTypes={mediaTypes} series={[]}/></div>;
}
