import 'server-only';
import { randomUUID } from 'node:crypto';
import { probeS3Object } from '@/lib/services/minio';
import { isSafeProviderImageUrl } from './provider-image-relay';
import { createCoverThumbFromObjectKey, uploadExternalCoverCandidate, uploadTitlePartPoster } from './storage';
import { resolveRecoveryCover } from './reconcile-source';
import { CoverRecoveryError, type CoverReconcileFindings, type CoverReconcileItem, type CoverReconcilePayload } from './reconcile-model';
import type { ReconcileCoverUpdate } from '@/db/queries/cover-reconcile';

export type ReconcileProcessResult = {
  status:'healthy'|'external'|'skipped'|'audit'|'restored'|'retry'|'failed'; code:string;
  findings?:CoverReconcileFindings; update?:ReconcileCoverUpdate;
  objects?:{coverUrl:string|null;coverThumbUrl:string|null}; replacement?:boolean;
  fatal?:boolean; retryable?:boolean; deferSeconds?:number;
};
export const coverProcessDependencies={probe:probeS3Object,thumbnail:createCoverThumbFromObjectKey,resolve:resolveRecoveryCover,upload:uploadExternalCoverCandidate,uploadPart:uploadTitlePartPoster};
export type CoverProcessDependencies=typeof coverProcessDependencies;
const external=(key:string|null)=>Boolean(key && /^https?:\/\//i.test(key));

/** Network work only. Publication and progress are one separate fenced transaction. */
export async function processReconcileCover(item:CoverReconcileItem,p:CoverReconcilePayload,signal:AbortSignal,deps:CoverProcessDependencies=coverProcessDependencies):Promise<ReconcileProcessResult> {
  signal.throwIfAborted();
  let findings:CoverReconcileFindings|undefined;
  let objects:ReconcileProcessResult['objects'];
  try {
    if(external(item.coverUrl)||external(item.coverThumbUrl))return {status:'external',code:'external-cover'};
    const empty=!item.coverUrl;
    if(empty&&!p.includeEmpty)return {status:'skipped',code:'empty-disabled',findings:{empty:true,missingOriginal:false,missingThumbnail:false}};
    const [original,thumb]=await Promise.all([
      item.coverUrl ? deps.probe({objectKey:item.coverUrl,signal}) : Promise.resolve({status:'missing' as const}),
      item.coverThumbUrl ? deps.probe({objectKey:item.coverThumbUrl,signal}) : Promise.resolve({status:'missing' as const}),
    ]);
    signal.throwIfAborted();
    for(const result of [original,thumb])if(result.status==='error')throw new CoverRecoveryError(result.code,result.retryable,undefined,result.fatal);
    findings={empty,missingOriginal:!empty&&original.status==='missing',missingThumbnail:thumb.status==='missing'};
    if(original.status==='exists'&&thumb.status==='exists')return {status:'healthy',code:'healthy',findings};
    if(p.mode==='audit')return {status:'audit',code:empty?'empty-cover':original.status==='missing'?'missing-original':'missing-thumbnail',findings};
    if(original.status==='exists'){
      const key=`covers/reconcile-thumbs/${item.kind}-${item.id}-${randomUUID()}.webp`;
      const generated=await deps.thumbnail(item.coverUrl,{objectKey:key,signal});
      if(generated.ok)objects={coverUrl:null,coverThumbUrl:generated.coverThumbUrl};
      signal.throwIfAborted();
      if(!generated.ok)throw new CoverRecoveryError(generated.error,generated.retryable,undefined,generated.fatalStorage===true);
      objects={coverUrl:null,coverThumbUrl:generated.coverThumbUrl};
      return {status:'restored',code:'thumbnail-restored',findings,objects,update:{coverUrl:item.coverUrl!,coverThumbUrl:generated.coverThumbUrl}};
    }
    let replacement=false;
    let uploaded:Awaited<ReturnType<CoverProcessDependencies['upload']>>;
    if(item.kind==='title-part'){
      if(!item.posterSourceUrl)return {status:'skipped',code:'part-source-missing',findings};
      if(!isSafeProviderImageUrl('tmdb',item.posterSourceUrl))return {status:'skipped',code:'part-source-unsupported',findings};
      uploaded=await deps.uploadPart({partId:item.id,imageUrl:item.posterSourceUrl,signal});
    }else{
      let source=await deps.resolve(item,{includeEmpty:p.includeEmpty,allowReplacement:p.allowReplacement,signal});
      if(source.kind==='skip')return {status:'skipped',code:source.code,findings};
      uploaded=await deps.upload({mediaItemCode:item.code,candidate:source.candidate,signal});
      if(!uploaded.ok && [404,410].includes(uploaded.httpStatusCode??0) && source.exactImage){
        if(!p.allowReplacement)return {status:'skipped',code:'original-variant-unavailable',findings};
        source=await deps.resolve(item,{includeEmpty:p.includeEmpty,allowReplacement:true,forceReplacement:true,signal});
        if(source.kind==='skip')return {status:'skipped',code:source.code,findings};
        uploaded=await deps.upload({mediaItemCode:item.code,candidate:source.candidate,signal});
      }
      replacement=source.replacement;
    }
    if(!uploaded.ok)throw new CoverRecoveryError(uploaded.error,uploaded.retryable===true,undefined,uploaded.fatalStorage===true);
    objects={coverUrl:uploaded.coverUrl,coverThumbUrl:uploaded.coverThumbUrl};
    signal.throwIfAborted();
    if(!uploaded.coverUrl)throw new CoverRecoveryError('upload-without-key');
    // A concurrent S3 restore can make the former original available without changing the DB.
    if(item.coverUrl){
      const recheck=await deps.probe({objectKey:item.coverUrl,signal});
      if(recheck.status==='error')throw new CoverRecoveryError(recheck.code,recheck.retryable,undefined,recheck.fatal);
      if(recheck.status==='exists')return {status:'skipped',code:'source-reappeared',findings,objects};
    }
    const update={coverUrl:uploaded.coverUrl,coverThumbUrl:uploaded.coverThumbUrl,...(item.kind==='media-item'?{source:uploaded.source}:{})};
    if(uploaded.thumbnailError)return {status:'retry',code:uploaded.thumbnailError,findings,objects,update,replacement,retryable:uploaded.thumbnailRetryable!==false,fatal:uploaded.fatalStorage===true};
    return {status:'restored',code:replacement?'cover-replaced':'cover-restored',findings,objects,update,replacement};
  }catch(error){
    // Return owned objects even on cancellation: caller cleans them before propagating abort.
    if(signal.aborted)return {status:'retry',code:'cancelled',objects,findings,retryable:true};
    if(error instanceof CoverRecoveryError)return {status:error.retryable||error.deferSeconds||error.fatal?'retry':'failed',code:error.code,findings,objects,retryable:error.retryable,deferSeconds:error.deferSeconds,fatal:error.fatal};
    if(error instanceof Error && 'code' in error && error.code==='lease-lost')throw error;
    return {status:'retry',code:'cover-request-failed',findings,objects,retryable:true};
  }
}
