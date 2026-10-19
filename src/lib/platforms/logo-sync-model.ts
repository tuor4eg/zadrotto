import { JobError } from '@/lib/jobs/types';

export const PLATFORM_LOGOS_SYNC_TYPE = 'media.platform-logos-sync';
export type PlatformDirectoryCheckpoint = {cursor:number;complete:boolean;startedAt:string;names:string[];knownIds:string[]};
export type PlatformLogoSyncCheckpoint = {
  version:2;
  scopeIds:number[];
  queue:number[];
  position:number;
  stage:'identity'|'catalogue'|'profiles'|'images'|'request'|'complete';
  directory:Record<'igdb'|'rawg',PlatformDirectoryCheckpoint>;
  currentProvider?:'igdb'|'rawg';
  afterImageKey:string;
  retryIds:number[];
  retryAt:Record<string,string>;
  attempts:Record<string,number>;
  doneIds:number[];
  failedIds:number[];
  startedAt:string;
  initialMappedIds:number;
  counters?: {recoveredIds:number;createdRequests:number;autoApproved:number;applied:number;manualPending:number;skipped:number;processedPlatforms:number;remainingPlatforms:number;reusedImages:number;errors:number;storedImages:number;applying:number};
};
export type PlatformLogoSyncPayload={platformId?:number;force?:boolean;checkpoint?:PlatformLogoSyncCheckpoint};
const positiveInteger=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=2_147_483_647;
const nonnegativeInteger=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const validDate=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const idList=(value:unknown):value is number[]=>Array.isArray(value)&&value.every(positiveInteger)&&new Set(value).size===value.length;
function invalid():never {throw new JobError('invalid-payload','Некорректные параметры синхронизации логотипов.',{retryable:false});}
export function parsePlatformLogoSyncPayload(value:unknown):PlatformLogoSyncPayload {
  if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
  const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!['platformId','force','checkpoint'].includes(key))||(row.platformId!==undefined&&!positiveInteger(row.platformId))||(row.force!==undefined&&typeof row.force!=='boolean'))return invalid();
  if(row.checkpoint!==undefined) {
    if(!row.checkpoint||typeof row.checkpoint!=='object'||Array.isArray(row.checkpoint))return invalid();
    const cp=row.checkpoint as Partial<PlatformLogoSyncCheckpoint>;
    if(cp.version!==2||!idList(cp.scopeIds)||!idList(cp.queue)||!idList(cp.retryIds)||!idList(cp.doneIds)||!idList(cp.failedIds)||!nonnegativeInteger(cp.position)||cp.position>cp.queue.length
      ||!['identity','catalogue','profiles','images','request','complete'].includes(cp.stage??'')||typeof cp.afterImageKey!=='string'||!validDate(cp.startedAt)||!nonnegativeInteger(cp.initialMappedIds)
      ||(cp.currentProvider!==undefined&&!['igdb','rawg'].includes(cp.currentProvider))||!cp.directory||!cp.retryAt||!cp.attempts)return invalid();
    if([...cp.queue,...cp.retryIds,...cp.doneIds,...cp.failedIds].some(id=>!cp.scopeIds!.includes(id)))return invalid();
    for(const provider of ['igdb','rawg'] as const) {
      const entry=cp.directory[provider];
      if(!entry||!nonnegativeInteger(entry.cursor)||typeof entry.complete!=='boolean'||!validDate(entry.startedAt)||!Array.isArray(entry.names)||entry.names.some(name=>typeof name!=='string')||!Array.isArray(entry.knownIds)||entry.knownIds.some(id=>! /^[1-9]\d*$/.test(id)))return invalid();
    }
    if(Object.entries(cp.retryAt).some(([id,time])=>!positiveInteger(Number(id))||!validDate(time))||Object.entries(cp.attempts).some(([id,attempt])=>!positiveInteger(Number(id))||!nonnegativeInteger(attempt)||attempt>3))return invalid();
  }
  return row as PlatformLogoSyncPayload;
}
export function providerPlatformImageKey(profile:{provider:string;imageId:string|null;imageUrl:string|null}) {return profile.provider==='igdb'?profile.imageId:profile.imageUrl;}
