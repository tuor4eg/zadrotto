import { createHash } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { platformProviderProfiles } from '@/db/schema';
import { assertPlatformLogoJobLease, checkpointPlatformLogoJob, type PlatformLogoJobLease } from '@/db/queries/platform-logo-jobs';
import { fetchProviderImage } from '@/lib/covers/provider-image-relay';
import { AVATAR_MAX_BYTES } from '@/lib/avatars/config';
import { uploadS3Object } from '@/lib/services/minio';
import { transformPlatformLogo } from './logo-storage';
import { providerPlatformImageKey, type PlatformLogoSyncPayload } from './logo-sync-model';
import type { PlatformProvider } from './provider-api';

type ProfileImage = {provider:string;externalId:string;imageId:string|null;imageUrl:string|null;imageKey:string|null;imageObjectKey:string|null;imageContentHash:string|null};
type Dependencies = {fetchImage:typeof fetchProviderImage;transform:typeof transformPlatformLogo;upload:typeof uploadS3Object};
export function createPlatformProviderImageStore(dependencies:Partial<Dependencies>={}) {
  return async function saveImage(input:{lease:PlatformLogoJobLease;payload:PlatformLogoSyncPayload;profile:ProfileImage;signal?:AbortSignal}) {
    const {lease,payload,profile,signal}=input;
    const imageKey=providerPlatformImageKey(profile);
    if (!profile.imageUrl || !imageKey) return 'missing' as const;
    if (profile.imageKey===imageKey && profile.imageObjectKey && profile.imageContentHash) return 'cached' as const;
    signal?.throwIfAborted();
    await assertPlatformLogoJobLease(lease);
    const [shared]=await db.select({objectKey:platformProviderProfiles.imageObjectKey,hash:platformProviderProfiles.imageContentHash})
      .from(platformProviderProfiles).where(and(eq(platformProviderProfiles.provider,profile.provider),
        eq(platformProviderProfiles.imageKey,imageKey),isNotNull(platformProviderProfiles.imageObjectKey),isNotNull(platformProviderProfiles.imageContentHash))).limit(1);
    if(shared?.objectKey && shared.hash) {
      await checkpointPlatformLogoJob(lease,payload,async tx=>{
        const [current]=await tx.select({imageId:platformProviderProfiles.imageId,imageUrl:platformProviderProfiles.imageUrl})
          .from(platformProviderProfiles).where(and(eq(platformProviderProfiles.provider,profile.provider),eq(platformProviderProfiles.externalId,profile.externalId))).for('update');
        if(current && providerPlatformImageKey({...current,provider:profile.provider})===imageKey) {
          await tx.update(platformProviderProfiles).set({imageKey,imageObjectKey:shared.objectKey,imageContentHash:shared.hash,
            imageFetchedAt:new Date(),imageError:null,updatedAt:new Date()})
            .where(and(eq(platformProviderProfiles.provider,profile.provider),eq(platformProviderProfiles.externalId,profile.externalId)));
        }
      });
      return 'cached' as const;
    }
    const image=await (dependencies.fetchImage??fetchProviderImage)({providerCode:profile.provider as PlatformProvider,imageUrl:profile.imageUrl,maxBytes:AVATAR_MAX_BYTES});
    signal?.throwIfAborted();
    if(!image.ok) throw new Error('Не удалось загрузить логотип платформы.');
    const body=await (dependencies.transform??transformPlatformLogo)(image.body);
    const contentHash=createHash('sha256').update(body).digest('hex');
    const objectKey=`avatars/platform-providers/${profile.provider}/${profile.externalId}/${contentHash}.webp`;
    await (dependencies.upload??uploadS3Object)({objectKey,body,contentType:'image/webp'});
    signal?.throwIfAborted();
    await checkpointPlatformLogoJob(lease,payload,async tx=>{
      const [current]=await tx.select({imageId:platformProviderProfiles.imageId,imageUrl:platformProviderProfiles.imageUrl}).from(platformProviderProfiles).where(and(eq(platformProviderProfiles.provider,profile.provider),eq(platformProviderProfiles.externalId,profile.externalId))).for('update');
      if (!current || providerPlatformImageKey({...current,provider:profile.provider})!==imageKey) return;
      await tx.update(platformProviderProfiles).set({imageKey,imageObjectKey:objectKey,imageContentHash:contentHash,imageFetchedAt:new Date(),imageError:null,updatedAt:new Date()}).where(and(eq(platformProviderProfiles.provider,profile.provider),eq(platformProviderProfiles.externalId,profile.externalId)));
    });
    return 'saved' as const;
  };
}
export const saveProviderPlatformImage=createPlatformProviderImageStore();
