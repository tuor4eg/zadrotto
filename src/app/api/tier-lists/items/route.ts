import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { getTierItems } from '@/db/queries/tier-lists';
import { checkFixedWindowRateLimit } from '@/lib/rate-limits/redis';
import { getAuthRequestIpAddress } from '@/lib/auth/rate-limits';
export async function GET(request:Request) {
 const limit=await checkFixedWindowRateLimit({keyPrefix:'tier-list-items',subject:await getAuthRequestIpAddress(),window:'minute',limit:60});
 if(!limit.ok)return Response.json({error:'Поиск временно недоступен.'},{status:503});
 if(!limit.allowed)return Response.json({error:'Слишком много запросов.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}});
 const raw=new URL(request.url).searchParams.get('ids')??'';
 if(raw.length>12000)return Response.json({error:'Слишком много записей.'},{status:400});
 const ids=raw?raw.split(',').map(Number):[];
 if(ids.length>1000||ids.some(id=>!Number.isSafeInteger(id)||id<1||id>2147483647))return Response.json({error:'Некорректные записи.'},{status:400});
 const author=await getCurrentAuthor();
 return Response.json(await getTierItems([...new Set(ids)],author?.id,author?.id),{headers:{'Cache-Control':'private, no-store'}});
}
