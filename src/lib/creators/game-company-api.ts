import { fetchGameProvider } from "@/lib/covers/game-provider-budget";
import { getIgdbAccessToken } from "@/lib/covers/providers/igdb";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout, ProviderHttpError } from "@/lib/covers/providers/shared";
import type { ProviderSearchOptions } from "@/lib/covers/types";
import { getIgdbCompanyReferences, getRawgCompanyReferences } from "@/lib/creators/game-company-references";
import { isGameCompanyId, type GameCompanyProvider, type GameCompanyProfile, type GameCompanyReference } from "@/lib/creators/game-companies";

import { providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { creatorProfileDescriptor, creatorProfileTargetFromBinding, IGDB_COMPANY_PROFILE_FIELDS } from "@/lib/providers/creator-profile-targets";
import type { JSONValue } from "@/lib/providers/types";

export type GameCompanyApiOptions = {
  jobGuard?: SnapshotJobGuard;
  providerCredentials?: ProviderSearchOptions["providerCredentials"];
  backfill?: boolean;
  signal?: AbortSignal;
};
export type GameCompanyRoster = { externalId: string; references: GameCompanyReference[] };

export async function fetchRawgJson<T>(url: URL, init?: RequestInit, backfill = false): Promise<T> {
  const response = await fetchGameProvider("rawg", url, {...init, signal:withProviderTimeout(getActiveProviderRequestTimeoutMs(),init?.signal)},backfill);
  if (!response.ok) throw new ProviderHttpError(response.status,null);
  return await response.json() as T;
}
async function igdbJson<T>(endpoint: string, body: string, options: GameCompanyApiOptions): Promise<T> {
  const credentials = options.providerCredentials?.igdb;
  if (!credentials?.clientId || !credentials.clientSecret) throw new Error("Не настроены учётные данные IGDB.");
  const token = await getIgdbAccessToken({clientId:credentials.clientId,clientSecret:credentials.clientSecret});
  if (!token) throw new Error("Не удалось авторизоваться в IGDB.");
  const response = await fetchGameProvider("igdb",`https://api.igdb.com/v4/${endpoint}`,{
    method:"POST",headers:{accept:"application/json","Client-ID":credentials.clientId,Authorization:`Bearer ${token}`},body,
    signal:withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal),
  },options.backfill);
  if (!response.ok) throw new ProviderHttpError(response.status,null);
  return await response.json() as T;
}
function rawgUrl(path:string, options:GameCompanyApiOptions) {
  const key = options.providerCredentials?.rawg?.apiKey;
  if (!key) throw new Error("Не настроены учётные данные RAWG.");
  const url = new URL(`https://api.rawg.io/api/${path}`);
  url.searchParams.set("key",key);
  return url;
}
function gameIds(values:string[]) {
  const ids = [...new Set(values)];
  if (ids.some(value=>! /^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error("Некорректный ID игры.");
  return ids;
}
export async function fetchGameCompanyRosters(provider:GameCompanyProvider, externalIds:string[], options:GameCompanyApiOptions = {}):Promise<GameCompanyRoster[]> {
  options.signal?.throwIfAborted();
  const ids = gameIds(externalIds);
  const result:GameCompanyRoster[]=[];
  if (provider === "igdb") {
    for(let offset=0;offset<ids.length;offset+=50) {
      const batch=ids.slice(offset,offset+50);
      const games=await igdbJson<Array<{id:number;involved_companies?:Parameters<typeof getIgdbCompanyReferences>[0]}>>("games",`fields involved_companies.company.id,involved_companies.company.name,involved_companies.company.url,involved_companies.developer,involved_companies.publisher; where id = (${batch.join(",")}); limit 50;`,options);
      if (!Array.isArray(games)) throw new Error("Некорректный ответ IGDB.");
      for(const game of games) {
        if (!batch.includes(String(game.id))) throw new Error("Неожиданный ID игры IGDB.");
        const references=getIgdbCompanyReferences(game.involved_companies ?? []);
        if (references === undefined) throw new Error("Неполный состав организаций IGDB.");
        result.push({externalId:String(game.id),references});
      }
    }
  } else {
    for(const id of ids) {
      const details=await fetchRawgJson<Parameters<typeof getRawgCompanyReferences>[0] & {id:number}>(rawgUrl(`games/${id}`,options),{signal:options.signal},options.backfill);
      if(String(details.id)!==id) throw new Error("Неожиданный ID игры RAWG.");
      const references=getRawgCompanyReferences(details);
      if(references===undefined) throw new Error("Неполный состав организаций RAWG.");
      result.push({externalId:id,references});
    }
  }
  return result;
}
export async function fetchGameCompanyProfiles(provider:GameCompanyProvider, externalIds:string[], options:GameCompanyApiOptions = {}):Promise<GameCompanyProfile[]> {
  options.signal?.throwIfAborted();
  const ids=[...new Set(externalIds)];
  if(ids.some(id=>!isGameCompanyId(provider,id))) throw new Error("Некорректный ID организации.");
  const result:GameCompanyProfile[]=[];
  if(provider==="igdb") {
    for(let offset=0;offset<ids.length;offset+=100) {
      const batch=ids.slice(offset,offset+100).map(id=>id.split(":")[1]);
      const requestStartedAt = await providerRequestStartedAt();
      const rows=await igdbJson<Array<{id:number;name?:string;url?:string;slug?:string;logo?:{image_id?:string};description?:string;country?:number;websites?:unknown;parent?:number;changed_company_id?:number}>>("companies",`fields ${IGDB_COMPANY_PROFILE_FIELDS}; where id = (${batch.join(",")}); limit 100;`,options);
      if(!Array.isArray(rows)) throw new Error("Некорректный ответ IGDB.");
      for(const row of rows) {
        if(!batch.includes(String(row.id)) || !row.name?.trim()) throw new Error("Некорректный профиль IGDB.");
        await persistProfileRaw(provider, `company:${row.id}`, row as unknown as JSONValue, requestStartedAt, options);
        const {id,name,url,slug,logo,...details}=row;
        result.push({provider,externalId:`company:${id}`,name:name.trim(),sourceUrl:url??(slug?`https://www.igdb.com/companies/${slug}`:null),details,imageUrl:logo?.image_id?`https://images.igdb.com/igdb/image/upload/t_original/${logo.image_id}.png`:null});
      }
    }
  } else {
    for(const externalId of ids) {
      const [kind,id]=externalId.split(":");
      let row:{id:number;name?:string;slug?:string;description?:string;image_background?:string;games_count?:number};
      const requestStartedAt = await providerRequestStartedAt();
      try { row=await fetchRawgJson(rawgUrl(`${kind}s/${id}`,options),{signal:options.signal},options.backfill); }
      catch(error) { if(error instanceof ProviderHttpError && error.status===404) continue; throw error; }
      if(String(row.id)!==id || !row.name?.trim()) throw new Error("Некорректный профиль RAWG.");
      await persistProfileRaw(provider, externalId, row as unknown as JSONValue, requestStartedAt, options);
      result.push({provider,externalId,name:row.name.trim(),sourceUrl:`https://rawg.io/${kind}s/${row.slug??id}`,details:{description:row.description??null,image_background:row.image_background??null,games_count:row.games_count??null},imageUrl:null});
    }
  }
  return result;
}

async function persistProfileRaw(provider: GameCompanyProvider, externalCreatorId: string, payload: JSONValue, requestStartedAt: Date, options: GameCompanyApiOptions) {
  options.signal?.throwIfAborted();
  const target = creatorProfileTargetFromBinding({ provider, externalCreatorId });
  if (!target) throw new Error("INVALID_CREATOR_PROFILE_TARGET");
  await saveProviderSnapshot({ ...creatorProfileDescriptor(target), payload, payloadHash: "", contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.jobGuard);
}
