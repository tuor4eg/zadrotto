'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAuthor } from '@/lib/auth/author-auth';
import { createTierList, saveTierList, changeTierListStatus, deleteTierList, TierListError } from '@/db/queries/tier-lists';
import { isUuid, MAX_TIER_LIST_PAYLOAD_BYTES, parseTierLocalDraft, type TierActionResult, type TierCreateInput, type TierLocalDraft, type TierSaveInput } from '@/lib/tier-lists/model';

function validShape(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || Buffer.byteLength(JSON.stringify(value),'utf8') > MAX_TIER_LIST_PAYLOAD_BYTES) throw new TierListError('validation','Некорректные данные запроса.');
}
function resultError(error: unknown): {ok:false;error:string;code:string} {
  if (error instanceof TierListError) return {ok:false,error:error.message,code:error.code};
  console.error('Tier list mutation failed',error);
  return {ok:false,error:'Не удалось сохранить тир-лист. Повторите попытку.',code:'server'};
}
async function authorId() { const author = await getCurrentAuthor(); if(!author) throw new TierListError('auth','Войдите в аккаунт для сохранения на сервере.'); return author.id; }
function invalidate(publicId?:string) { revalidatePath('/tier-lists'); revalidatePath('/feed'); if(publicId) {revalidatePath(`/tier-lists/${publicId}`);revalidatePath(`/tier-lists/${publicId}/edit`);} }
export async function createTierListAction(input:TierCreateInput):Promise<TierActionResult> {
  try { const id=await authorId(); validShape(input,['clientCreationId','title','templateId','distribution']); const document=await createTierList(input,id); invalidate(document.publicId); return {ok:true,document}; } catch(error) {return resultError(error);}
}
export async function saveTierListAction(input:TierSaveInput):Promise<TierActionResult> {
  try { const id=await authorId(); validShape(input,['publicId','version','title','distribution']); const document=await saveTierList(input,id); invalidate(document.publicId);return {ok:true,document}; } catch(error) {return resultError(error);}
}
export async function importTierListAction(input:TierLocalDraft):Promise<TierActionResult> {
  try { const id=await authorId(); validShape(input,['schemaVersion','clientCreationId','title','templateId','snapshotToken','configuration','distribution','updatedAt']); const draft=parseTierLocalDraft(input); if(!draft) throw new TierListError('validation','Локальный черновик повреждён.'); const document=await createTierList({clientCreationId:draft.clientCreationId,title:draft.title,templateId:draft.templateId,distribution:draft.distribution},id,draft); invalidate(document.publicId);return {ok:true,document}; } catch(error) {return resultError(error);}
}
export async function changeTierListStatusAction(input:{publicId:string;version:number;status:'draft'|'published'}):Promise<TierActionResult> {
  try {const id=await authorId(); validShape(input,['publicId','version','status']);const document=await changeTierListStatus(input,id);invalidate(document.publicId);return {ok:true,document};} catch(error) {return resultError(error);}
}
export async function deleteTierListAction(input:{publicId:string;version:number}):Promise<{ok:true}|{ok:false;error:string;code:string}> {
  try {const id=await authorId();validShape(input,['publicId','version']);if(!isUuid(input.publicId))throw new TierListError('validation','Некорректная ссылка.');await deleteTierList(input,id);invalidate(input.publicId);return {ok:true};} catch(error) {return resultError(error);}
}
