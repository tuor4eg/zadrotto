import { and, eq, isNull, or, sql } from "drizzle-orm";

import { creatorRequests, creatorRequestMediaItems, creatorRoles, creators, creatorTypes, providerCreatorBindings, providerCreatorExclusions } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";
import { normalizeSearchText } from "@/lib/search/normalize";
import { CreatorRequestError } from "@/lib/creators/creator-request-error";
import { isOrganizationCreatorRequest } from "@/lib/creators/request-kind";
import { getCreatorAutoApprovalCandidates } from "./creator-auto-approval-candidates";
import type { CreatorTransaction } from "./creators";

/** Must run under the shared approval lock, before any creation. Names never prove identity. */
export async function prepareAutomaticCreatorDecision(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect): Promise<{
  decision: "create" | "map";
  creatorId?: number;
  name: string;
  typeCode: "person" | "collective" | "organization";
}> {
  if (request.manuallyReopened || request.applyStatus !== "pending" || request.decision !== null) {
    throw new CreatorRequestError("auto-skip", "Заявка требует ручного решения.");
  }
  const normalizedName = normalizeSearchText(request.externalCreatorName);
  if (!normalizedName || normalizedName !== request.normalizedExternalCreatorName) {
    throw new CreatorRequestError("auto-skip", "Некорректное имя требует проверки.");
  }
  const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(
    eq(providerCreatorExclusions.provider, request.provider),
    or(
      request.externalCreatorId === null ? undefined : eq(providerCreatorExclusions.externalCreatorId, request.externalCreatorId),
      and(isNull(providerCreatorExclusions.externalCreatorId), eq(providerCreatorExclusions.mediaType, request.mediaType), eq(providerCreatorExclusions.normalizedExternalCreatorName, normalizedName)),
    ),
  )).limit(1);
  if (excluded) throw new CreatorRequestError("auto-skip", "Создатель исключён администратором.");

  const names = await tx.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) })
    .from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, request.id)).limit(2);
  if (names.length !== 1 || names[0].name !== normalizedName) {
    throw new CreatorRequestError("auto-skip", "Разные варианты имени или отсутствие записей требуют проверки.");
  }
  const roles = await tx.selectDistinct({ code: creatorRoles.code }).from(creatorRequestMediaItems)
    .innerJoin(creatorRoles, eq(creatorRoles.id, creatorRequestMediaItems.roleId))
    .where(eq(creatorRequestMediaItems.requestId, request.id));
  const organization = isOrganizationCreatorRequest(request.provider, request.externalCreatorId)
    || roles.every(role => role.code === "publisher");
  const typeCode = organization ? "organization" : "person";
  if (request.externalCreatorId !== null) {
    const [binding] = await tx.select({ creatorId: providerCreatorBindings.creatorId, active: providerCreatorBindings.active, type: creatorTypes.code })
      .from(providerCreatorBindings)
      .innerJoin(creators, eq(creators.id, providerCreatorBindings.creatorId))
      .innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
      .where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId)))
      .orderBy(sql`${providerCreatorBindings.active} desc`).limit(1);
    if (binding) {
      if (!binding.active) throw new CreatorRequestError("auto-skip", "Прежняя привязка требует ручного решения.");
      if (binding.type !== typeCode && !(request.provider === "bgg" && binding.type === "collective")) {
        throw new CreatorRequestError("auto-skip", "Тип подтверждённого создателя требует проверки.");
      }
      return { decision: "map", creatorId: binding.creatorId, name: request.externalCreatorName, typeCode: binding.type as "person" | "collective" | "organization" };
    }
  }
  const candidates = await getCreatorAutoApprovalCandidates(tx, request.externalCreatorName);
  if (candidates.length) throw new CreatorRequestError("auto-skip", "Совпадение имени требует ручной проверки.", candidates);
  return { decision: "create", name: request.externalCreatorName, typeCode };
}
