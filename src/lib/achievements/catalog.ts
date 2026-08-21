import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { contributions, franchises, mediaItemFranchises, mediaItems, ratings } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { DomainEventType } from "@/lib/domain-events/catalog";

export const ACHIEVEMENT_MECHANIC_CODES = [
  "rating.authored.count",
  "review.authored.count",
  "media.authored.count",
] as const;
export type AchievementMechanicCode = (typeof ACHIEVEMENT_MECHANIC_CODES)[number];
export type CountMechanicParams = { mediaType?: string; seriesId?: number };

export type MechanicParameterDefinition = {
  code: string;
  label: string;
  required: boolean;
  type: "mediaType" | "series";
};
export type AchievementMechanicInstance<TParams = unknown> = { achievementId: number; params: TParams };
export type AchievementProgress = { achievementId: number; authorId: number; value: number };
export type AchievementMechanicDefinition<TParams = unknown> = {
  code: AchievementMechanicCode;
  label: string;
  eventTypes: readonly DomainEventType[];
  params: readonly MechanicParameterDefinition[];
  parseParams: (value: unknown) => TParams;
  evaluateBatch: (input: {
    tx: DbTransaction;
    authorIds: readonly number[];
    instances: readonly AchievementMechanicInstance<TParams>[];
  }) => Promise<AchievementProgress[]>;
};

type CountInstanceGroup = { achievementIds: number[]; params: CountMechanicParams };

function parseCountParams(value: unknown): CountMechanicParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Параметры механики должны быть объектом.");
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== "mediaType" && key !== "seriesId")) throw new Error("Механика получила неподдерживаемый параметр.");
  if (source.mediaType !== undefined && (typeof source.mediaType !== "string" || source.mediaType.trim() === "")) throw new Error("mediaType должен быть непустой строкой.");
  if (source.seriesId !== undefined && (!Number.isSafeInteger(source.seriesId) || Number(source.seriesId) < 1)) throw new Error("seriesId должен быть положительным целым числом.");
  return {
    ...(source.mediaType === undefined ? {} : { mediaType: String(source.mediaType).trim() }),
    ...(source.seriesId === undefined ? {} : { seriesId: Number(source.seriesId) }),
  };
}

function groupCountInstances(instances: readonly AchievementMechanicInstance<CountMechanicParams>[]) {
  const groups = new Map<string, CountInstanceGroup>();
  for (const instance of instances) {
    const key = JSON.stringify({ mediaType: instance.params.mediaType ?? null, seriesId: instance.params.seriesId ?? null });
    const group = groups.get(key) ?? { achievementIds: [], params: instance.params };
    groups.set(key, { ...group, achievementIds: [...group.achievementIds, instance.achievementId] });
  }
  return [...groups.values()];
}

function publishedSeriesFilter(mediaItemId: SQLWrapper, seriesId?: number): SQL {
  if (seriesId === undefined) return sql`true`;
  return sql`exists (
    with recursive series_tree as (
      select ${franchises.id} from ${franchises}
        where ${franchises.id} = ${seriesId} and ${franchises.publicationStatus} = 'published'
      union all
      select child.id from ${franchises} child
        inner join series_tree parent on child.parent_id = parent.id
        where child.publication_status = 'published'
    )
    select 1 from ${mediaItemFranchises}
      inner join series_tree on series_tree.id = ${mediaItemFranchises.franchiseId}
      where ${mediaItemFranchises.mediaItemId} = ${mediaItemId}
        and ${mediaItemFranchises.publicationStatus} = 'published'
  )`;
}

function mapCountProgress(rows: Iterable<Record<string, unknown>>, groupedInstances: readonly CountInstanceGroup[]) {
  return Array.from(rows).flatMap((row) =>
    groupedInstances[Number(row.groupIndex)]!.achievementIds.map((achievementId) => ({
      achievementId, authorId: Number(row.authorId), value: Number(row.value),
    })),
  );
}

async function evaluateAuthoredCount(input: {
  tx: DbTransaction;
  authorIds: readonly number[];
  instances: readonly AchievementMechanicInstance<CountMechanicParams>[];
  source: "rating" | "review";
}) {
  if (input.authorIds.length === 0 || input.instances.length === 0) return [];
  const groupedInstances = groupCountInstances(input.instances);
  const queries = groupedInstances.map((instance, groupIndex) => {
    const authorId = input.source === "rating" ? ratings.authorId : contributions.authorId;
    const mediaItemId = input.source === "rating" ? ratings.mediaItemId : contributions.primaryMediaItemId;
    const sourceTable = input.source === "rating" ? ratings : contributions;
    const sourceFilter = input.source === "rating" ? sql`true` : sql`${contributions.type} = 'review' and ${contributions.status} = 'published'`;
    return sql`select ${groupIndex}::int as "groupIndex", ${authorId}::int as "authorId",
        count(distinct ${mediaItemId})::int as "value"
      from ${sourceTable}
      inner join ${mediaItems} on ${mediaItems.id} = ${mediaItemId}
      where ${authorId} in (${sql.join(input.authorIds.map((id) => sql`${id}`), sql`, `)})
        and ${mediaItems.publicationStatus} = 'published' and ${sourceFilter}
        and ${instance.params.mediaType === undefined ? sql`true` : sql`${mediaItems.mediaType} = ${instance.params.mediaType}`}
        and ${publishedSeriesFilter(mediaItemId, instance.params.seriesId)}
      group by ${authorId}`;
  });
  const result = await input.tx.execute(sql.join(queries, sql` union all `));
  return mapCountProgress(result as Iterable<Record<string, unknown>>, groupedInstances);
}

async function evaluateCreatedMediaCount(input: {
  tx: DbTransaction;
  authorIds: readonly number[];
  instances: readonly AchievementMechanicInstance<CountMechanicParams>[];
}) {
  if (input.authorIds.length === 0 || input.instances.length === 0) return [];
  const groupedInstances = groupCountInstances(input.instances);
  const queries = groupedInstances.map((instance, groupIndex) => sql`select ${groupIndex}::int as "groupIndex",
      ${mediaItems.createdByAuthorId}::int as "authorId",
      count(${mediaItems.id})::int as "value"
    from ${mediaItems}
    where ${mediaItems.createdByAuthorId} in (${sql.join(input.authorIds.map((id) => sql`${id}`), sql`, `)})
      and ${mediaItems.publicationStatus} = 'published'
      and ${instance.params.mediaType === undefined ? sql`true` : sql`${mediaItems.mediaType} = ${instance.params.mediaType}`}
      and ${publishedSeriesFilter(mediaItems.id, instance.params.seriesId)}
    group by ${mediaItems.createdByAuthorId}`);
  const result = await input.tx.execute(sql.join(queries, sql` union all `));
  return mapCountProgress(result as Iterable<Record<string, unknown>>, groupedInstances);
}

export const achievementMechanicRegistry: readonly AchievementMechanicDefinition[] = [
  {
    code: "rating.authored.count", label: "Количество поставленных оценок",
    eventTypes: ["rating.created", "media.published", "media-franchise.published", "franchise.parent.changed"],
    params: [
      { code: "mediaType", label: "Тип медиа", required: false, type: "mediaType" },
      { code: "seriesId", label: "Серия", required: false, type: "series" },
    ],
    parseParams: parseCountParams,
    evaluateBatch: (input) => evaluateAuthoredCount({
      ...input,
      instances: input.instances as readonly AchievementMechanicInstance<CountMechanicParams>[],
      source: "rating",
    }),
  },
  {
    code: "review.authored.count", label: "Количество опубликованных рецензий",
    eventTypes: ["review.published", "media.published", "media-franchise.published", "franchise.parent.changed"],
    params: [
      { code: "mediaType", label: "Тип медиа", required: false, type: "mediaType" },
      { code: "seriesId", label: "Серия", required: false, type: "series" },
    ],
    parseParams: parseCountParams,
    evaluateBatch: (input) => evaluateAuthoredCount({
      ...input,
      instances: input.instances as readonly AchievementMechanicInstance<CountMechanicParams>[],
      source: "review",
    }),
  },
  {
    code: "media.authored.count", label: "Количество добавленных записей",
    eventTypes: ["media.published", "media-franchise.published", "franchise.parent.changed"],
    params: [
      { code: "mediaType", label: "Тип медиа", required: false, type: "mediaType" },
      { code: "seriesId", label: "Серия", required: false, type: "series" },
    ],
    parseParams: parseCountParams,
    evaluateBatch: (input) => evaluateCreatedMediaCount({
      ...input,
      instances: input.instances as readonly AchievementMechanicInstance<CountMechanicParams>[],
    }),
  },
];

export function getAchievementMechanic(code: string) {
  return achievementMechanicRegistry.find((mechanic) => mechanic.code === code);
}
