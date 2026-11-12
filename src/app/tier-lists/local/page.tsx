import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { LocalTierPreview } from './preview';

export const metadata = { title: 'Локальный тир-лист', robots: { index: false, follow: false } };

export default async function LocalTierListPage() {
  const author = await getCurrentAuthor();
  return <LocalTierPreview author={author ? { name: author.name, code: author.code } : null} />;
}
