import { fetchGameProvider } from "@/lib/covers/game-provider-budget";
import { getIgdbAccessToken } from "@/lib/covers/providers/igdb";
import { getActiveProviderRequestTimeoutMs, ProviderHttpError, withProviderTimeout } from "@/lib/covers/providers/shared";
import { isSafeProviderImageUrl } from "@/lib/covers/provider-image-relay";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { ProviderSearchOptions } from "@/lib/covers/types";

export type PlatformProvider = "igdb" | "rawg";
export type ProviderPlatformProfile = {
  provider: PlatformProvider;
  externalId: string;
  name: string;
  normalizedName: string;
  sourceUrl: string | null;
  imageId: string | null;
  imageUrl: string | null;
};
export type PlatformCataloguePage = { profiles: ProviderPlatformProfile[]; nextCursor: number | null };
export type PlatformApiOptions = {
  providerCredentials?: ProviderSearchOptions["providerCredentials"];
  signal?: AbortSignal;
  backfill?: boolean;
};
type PlatformApiDependencies = { fetchProvider: typeof fetchGameProvider; token: typeof getIgdbAccessToken };
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const validName = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

export function parseIgdbPlatformProfiles(value: unknown): ProviderPlatformProfile[] {
  if (!Array.isArray(value)) throw new Error('Некорректный каталог платформ IGDB.');
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Некорректная платформа IGDB.');
    const item = row as { id?:unknown; name?:unknown; url?:unknown; platform_logo?:unknown };
    if (!positiveId(item.id) || !validName(item.name)) throw new Error('Некорректная идентичность платформы IGDB.');
    let imageId: string | null = null;
    if (item.platform_logo !== undefined && item.platform_logo !== null) {
      if (typeof item.platform_logo !== 'object') throw new Error('Неполные данные логотипа IGDB.');
      const logo = item.platform_logo as { image_id?:unknown };
      if (typeof logo.image_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(logo.image_id)) throw new Error('Некорректный ID логотипа IGDB.');
      imageId = logo.image_id;
    }
    return {provider:'igdb',externalId:String(item.id),name:item.name.trim(),normalizedName:normalizeSearchText(item.name),
      sourceUrl:typeof item.url === 'string' && item.url.startsWith('https://www.igdb.com/') ? item.url : null,
      imageId,imageUrl:imageId ? `https://images.igdb.com/igdb/image/upload/t_original/${imageId}.png` : null};
  });
}
export function parseRawgPlatformProfiles(value: unknown): ProviderPlatformProfile[] {
  if (!Array.isArray(value)) throw new Error('Некорректный каталог платформ RAWG.');
  return value.map((row:unknown)=>{
    if (!row || typeof row !== 'object') throw new Error('Некорректная платформа RAWG.');
    const item=row as {id?:unknown;name?:unknown;slug?:unknown;image?:unknown};
    if (!positiveId(item.id) || !validName(item.name)) throw new Error('Некорректная идентичность платформы RAWG.');
    // RAWG backgrounds represent games and must never become platform logos.
    const imageUrl=typeof item.image==='string' && isSafeProviderImageUrl('rawg',item.image) ? item.image : null;
    const slug=typeof item.slug==='string' && /^[a-zA-Z0-9_-]+$/.test(item.slug) ? item.slug : String(item.id);
    return {provider:'rawg',externalId:String(item.id),name:item.name.trim(),normalizedName:normalizeSearchText(item.name),sourceUrl:`https://rawg.io/platforms/${slug}`,imageId:imageUrl,imageUrl};
  });
}

export function createPlatformProviderApi(dependencies: Partial<PlatformApiDependencies> = {}) {
  const fetchProvider=dependencies.fetchProvider ?? fetchGameProvider;
  const getToken=dependencies.token ?? getIgdbAccessToken;
  async function igdb(body:string,options:PlatformApiOptions) {
    const credentials=options.providerCredentials?.igdb;
    if (!credentials?.clientId || !credentials.clientSecret) throw new Error('Не настроены учётные данные IGDB.');
    const token=await getToken({clientId:credentials.clientId,clientSecret:credentials.clientSecret});
    if (!token) throw new Error('Не удалось авторизоваться в IGDB.');
    options.signal?.throwIfAborted();
    const response=await fetchProvider('igdb','https://api.igdb.com/v4/platforms',{method:'POST',headers:{accept:'application/json','Client-ID':credentials.clientId,Authorization:`Bearer ${token}`},body,signal:withProviderTimeout(getActiveProviderRequestTimeoutMs(),options.signal)},options.backfill ?? true);
    if (!response.ok) throw new ProviderHttpError(response.status,null);
    return response.json() as Promise<unknown>;
  }
  return {
    async fetchCataloguePage(provider:PlatformProvider,cursor=0,options:PlatformApiOptions={}):Promise<PlatformCataloguePage> {
      if (!Number.isSafeInteger(cursor) || cursor<0) throw new Error('Некорректный курсор каталога платформ.');
      options.signal?.throwIfAborted();
      if (provider==='igdb') {
        // Keyset pagination survives changes in earlier pages during a long operation.
        const profiles=parseIgdbPlatformProfiles(await igdb(`fields name,url,platform_logo.image_id; where id > ${cursor}; sort id asc; limit 500;`,options));
        if (profiles.some(row=>Number(row.externalId)<=cursor)) throw new Error('Каталог IGDB не продвинул курсор.');
        return {profiles,nextCursor:profiles.length===500 ? Math.max(...profiles.map(row=>Number(row.externalId))) : null};
      }
      const key=options.providerCredentials?.rawg?.apiKey;
      if (!key) throw new Error('Не настроены учётные данные RAWG.');
      const page=cursor || 1;
      const url=new URL('https://api.rawg.io/api/platforms');
      url.searchParams.set('key',key);url.searchParams.set('page',String(page));url.searchParams.set('page_size','40');
      const response=await fetchProvider('rawg',url,{signal:withProviderTimeout(getActiveProviderRequestTimeoutMs(),options.signal)},options.backfill ?? true);
      if (!response.ok) throw new ProviderHttpError(response.status,null);
      const payload=await response.json() as {results?:unknown;next?:unknown};
      if (!payload || typeof payload!=='object' || !(payload.next===null || typeof payload.next==='string')) throw new Error('Некорректная страница каталога RAWG.');
      const profiles=parseRawgPlatformProfiles(payload.results);
      if(payload.next && !profiles.length) throw new Error('Пустая продолжающаяся страница RAWG.');
      return {profiles,nextCursor:payload.next ? page+1 : null};
    },
    async fetchProfiles(provider:PlatformProvider,externalIds:string[],options:PlatformApiOptions={}):Promise<ProviderPlatformProfile[]> {
      const ids=[...new Set(externalIds)];
      if(ids.some(id=>! /^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))||ids.length>(provider==='igdb'?100:1))throw new Error('Некорректные ID платформ.');
      if(!ids.length)return [];
      if(provider==='igdb')return parseIgdbPlatformProfiles(await igdb(`fields name,url,platform_logo.image_id; where id = (${ids.join(',')}); limit 100;`,options));
      const key=options.providerCredentials?.rawg?.apiKey;
      if(!key)throw new Error('Не настроены учётные данные RAWG.');
      const url=new URL(`https://api.rawg.io/api/platforms/${ids[0]}`);url.searchParams.set('key',key);
      const response=await fetchProvider('rawg',url,{signal:withProviderTimeout(getActiveProviderRequestTimeoutMs(),options.signal)},options.backfill??true);
      if(response.status===404)return [];
      if(!response.ok)throw new ProviderHttpError(response.status,null);
      return parseRawgPlatformProfiles([await response.json()]);
    },
    async fetchIgdbProfiles(externalIds:string[],options:PlatformApiOptions={}):Promise<ProviderPlatformProfile[]> {
      const ids=[...new Set(externalIds)];
      if (ids.length>100 || ids.some(id=>! /^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) throw new Error('Некорректные ID платформ IGDB.');
      if (!ids.length) return [];
      return parseIgdbPlatformProfiles(await igdb(`fields name,url,platform_logo.image_id; where id = (${ids.join(',')}); limit 100;`,options));
    },
  };
}
export const platformProviderApi=createPlatformProviderApi();
