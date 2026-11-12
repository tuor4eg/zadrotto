import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { searchTierListAuthors } from '@/db/queries/tier-lists';
import { checkFixedWindowRateLimit } from '@/lib/rate-limits/redis';
import { getAuthRequestIpAddress } from '@/lib/auth/rate-limits';
export async function GET(request:Request) {
 const limit=await checkFixedWindowRateLimit({keyPrefix:'tier-list-authors',subject:await getAuthRequestIpAddress(),window:'minute',limit:60});
 if(!limit.ok)return Response.json({error:'Поиск временно недоступен.'},{status:503});
 if(!limit.allowed)return Response.json({error:'Слишком много запросов.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}});
 const author=await getCurrentAuthor();
 return Response.json(await searchTierListAuthors((new URL(request.url).searchParams.get('q')??'').slice(0,100),author?.id),{headers:{'Cache-Control':'private, no-store'}});
}
