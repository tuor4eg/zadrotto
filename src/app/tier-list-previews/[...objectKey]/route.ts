import { getPublishedTierPreviewSource } from '@/db/queries/tier-list-previews';
import { getTierAvailableIds } from '@/db/queries/tier-lists';
import { tierPreviewListId } from '@/lib/tier-lists/preview';
import { fetchS3Object } from '@/lib/services/minio';

type Context = { params: Promise<{ objectKey: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  const segments = (await params).objectKey;
  const objectKey = segments.join('/');
  const id = tierPreviewListId(objectKey);
  const missing = () => new Response('Изображение не найдено.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  if (!id) return missing();
  const source = await getPublishedTierPreviewSource(id);
  if (!source || source.previewObjectKey !== objectKey || source.previewVersion !== source.version) return missing();
  // Removed/private records must not remain exposed through a previously rendered thumbnail.
  const ids = source.previewMediaIds;
  if ((await getTierAvailableIds(ids)).length !== ids.length) return missing();
  const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' };
  if (process.env.NODE_ENV !== 'development') return new Response(null, { headers: { ...headers, 'X-Accel-Redirect': `/_tier-list-previews/${segments.map(encodeURIComponent).join('/')}` } });
  const response = await fetchS3Object({ objectKey });
  if (!response?.body) return missing();
  return new Response(response.body, { headers });
}
