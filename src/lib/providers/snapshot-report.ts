import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItemMetadata, entryCreators, creators, creatorRoles, entryCreatorPseudonyms } from "@/db/schema";
import type { BookProjection } from "./types";
import { normalizeSearchText } from "@/lib/search/normalize";

/** Bounded, explicit comparison: never logs raw provider payloads or credentials. */
export async function getBookMigrationComparison(id:number,projection:BookProjection) {
  const [metadata]=await db.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,id));
  const contributors=await db.select({id:creators.id,name:creators.name,role:creatorRoles.code,isManual:entryCreators.isManual}).from(entryCreators)
    .innerJoin(creators,eq(creators.id,entryCreators.creatorId)).innerJoin(creatorRoles,eq(creatorRoles.id,entryCreators.roleId)).where(eq(entryCreators.entryId,id));
  const [pseudonym]=await db.select().from(entryCreatorPseudonyms).where(eq(entryCreatorPseudonyms.entryId,id));
  const oldAuthors=metadata?.facts.authors;
  const oldNames=typeof oldAuthors==="string"?[oldAuthors]:Array.isArray(oldAuthors)?oldAuthors.filter((value):value is string=>typeof value==="string"):[];
  const available=new Set(projection.contributors.map(item=>normalizeSearchText(item.name)));
  const blockers=oldNames.filter(name=>!available.has(normalizeSearchText(name))).map(()=>"legacy-author-not-in-provider");
  return {id,source:metadata?.sourceProvider,legacyKeys:Object.keys(metadata?.facts??{}).sort(),contributors,pseudonymCreatorId:pseudonym?.creatorId??null,
    proposed:projection.contributors.map(item=>({name:item.name,role:item.roleCode,externalId:item.externalId,position:item.position})),blockers};
}
