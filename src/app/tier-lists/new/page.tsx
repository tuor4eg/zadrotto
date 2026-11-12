import Link from 'next/link'
import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { getTierTemplates, getTierListSettings } from '@/db/queries/tier-lists';
import { getAccessibleMediaTypeOptions } from '@/db/queries/media-types';
import { TierListEditor } from '../editor';
export const metadata={title:'Создать тир-лист'};
export default async function NewTierListPage() {
  const author=await getCurrentAuthor();
  const [templates,limits,mediaTypes]=await Promise.all([getTierTemplates(),getTierListSettings(),getAccessibleMediaTypeOptions(author?.id)]);
  if(!templates.length)return <p className="p-4 text-sm text-stone-600 sm:p-6">Шаблоны пока недоступны.</p>;
  return <div className="p-4 sm:p-6"><nav aria-label="Хлебные крошки" className="mb-2 break-words text-xs lowercase text-stone-600"><Link href="/tier-lists" className="hover:text-red-950">Тир-листы</Link><span aria-hidden="true"> / </span><span aria-current="page">Новый</span></nav><h1 className="mb-4 text-2xl font-bold">Новый тир-лист</h1><TierListEditor key="new" templates={templates} limits={limits} authenticated={!!author} currentAuthorId={author?.id} items={[]} mediaTypes={mediaTypes} series={[]}/></div>;
}
