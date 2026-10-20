import { and, eq } from "drizzle-orm";
import { creators, creatorRoles, creatorRequests, creatorRequestMediaItems, entryCreatorSources, providerCreatorMappings } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { ProviderContributor } from "@/lib/providers/types";
import { normalizeSearchText } from "@/lib/search/normalize";

/** Working provenance, including pending/excluded occurrences; never raw snapshots or facts. */
export async function getWorkingBookPublishers(tx:DbTransaction,entryId:number,provider:string):Promise<ProviderContributor[]> {
  const occurrences=await tx.select({name:creatorRequestMediaItems.externalCreatorName,position:creatorRequestMediaItems.sourcePosition})
    .from(creatorRequestMediaItems).innerJoin(creatorRequests,eq(creatorRequests.id,creatorRequestMediaItems.requestId))
    .innerJoin(creatorRoles,eq(creatorRoles.id,creatorRequestMediaItems.roleId))
    .where(and(eq(creatorRequestMediaItems.mediaItemId,entryId),eq(creatorRequests.provider,provider),eq(creatorRoles.code,"publisher")));
  const sources=await tx.select({name:providerCreatorMappings.externalCreatorName,fallback:creators.name,position:entryCreatorSources.sourcePosition})
    .from(entryCreatorSources).innerJoin(creators,eq(creators.id,entryCreatorSources.creatorId))
    .innerJoin(creatorRoles,eq(creatorRoles.id,entryCreatorSources.roleId))
    .leftJoin(providerCreatorMappings,and(eq(providerCreatorMappings.provider,provider),eq(providerCreatorMappings.mediaType,"book"),eq(providerCreatorMappings.normalizedExternalCreatorName,entryCreatorSources.normalizedExternalCreatorName)))
    .where(and(eq(entryCreatorSources.entryId,entryId),eq(entryCreatorSources.provider,provider),eq(creatorRoles.code,"publisher")));
  const result=new Map<string,ProviderContributor>();
  for(const row of [...occurrences,...sources.map(row=>({...row,name:row.name??row.fallback}))]) {
    const key=normalizeSearchText(row.name);
    if(key&&!result.has(key))result.set(key,{name:row.name,position:row.position??result.size,externalId:null,roleCode:"publisher"});
  }
  return [...result.values()].sort((a,b)=>a.position-b.position);
}
