import { readCreatorFieldsSnapshots, readCreatorFieldsState, type CreatorFieldsState } from "@/db/queries/creator-fields-fill";
import type { StoredProviderSnapshot } from "@/db/queries/provider-snapshots";
import { projectCreatorFillDates, supportsCreatorFillDates } from "@/lib/providers/creator-fill-dates";
import { creatorFillDatesDescriptor, creatorProfileDescriptor, creatorProfileTargetFromBinding } from "@/lib/providers/creator-profile-targets";

function sourcesFor(state: CreatorFieldsState) {
  return state.bindings.map(binding => {
    const target = creatorProfileTargetFromBinding(binding);
    const supported = target && supportsCreatorFillDates(target)
      && (state.typeCode === "organization" ? target.provider === "igdb" : target.provider !== "igdb");
    return { ...binding, target: supported ? target : null };
  });
}

export function snapshotSources(state: CreatorFieldsState) {
  return sourcesFor(state).flatMap(({ id, target }) => {
    if (!target) return [];
    const primary = { bindingId: id, descriptor: creatorFillDatesDescriptor(target) };
    return target.provider === "igdb"
      ? [primary, { bindingId: -id, descriptor: creatorProfileDescriptor(target) }]
      : [primary];
  });
}

export type SnapshotMap = ReadonlyMap<number, StoredProviderSnapshot>;

export function inspectSources(state: CreatorFieldsState, snapshots: SnapshotMap) {
  return sourcesFor(state).map(source => {
    const snapshot = snapshots.get(source.id) ?? snapshots.get(-source.id);
    let projection: ReturnType<typeof projectCreatorFillDates> | undefined;
    let invalid = false;
    if (source.target && snapshot) {
      try {
        projection = projectCreatorFillDates(source.target, snapshot);
      } catch {
        invalid = true;
      }
    }
    const needsSnapshot = Boolean(source.target && (!snapshot || (
      !snapshots.has(source.id) && projection?.diagnostics.includes("unverified-start_date-precision")
    )));
    return { ...source, snapshot, projection, invalid, needsSnapshot };
  });
}

export function diagnosticMessage(code: string, reviewDates?: ReturnType<typeof projectCreatorFillDates>["reviewDates"]) {
  if (code === "ambiguous-birth" || code === "ambiguous-death") {
    const field = code === "ambiguous-birth" ? "Дата рождения" : "Дата смерти";
    const date = code === "ambiguous-birth" ? reviewDates?.birthDate : reviewDates?.deathDate;
    return `${field} ${date ?? "на 1 января"} требует ручной проверки точности.`;
  }
  if (code === "partial-start_date") return "Дата основания указана без точности до дня.";
  if (code === "unverified-start_date-precision") return "Точность даты основания требует проверки.";
  if (code === "fantlab-profile-not-opened") return "В профиле открыт ограниченный набор данных.";
  return "Дата неполная или некорректная.";
}

type CreatorFieldsPreview = {
  snapshot?: StoredProviderSnapshot;
  birthDate?: string | null;
  deathDate?: string | null;
  foundedDate?: string | null;
  diagnostics: string[];
};

export async function getCreatorFieldsPreview(creatorId: number): Promise<Map<number, CreatorFieldsPreview>> {
  const state = await readCreatorFieldsState(creatorId);
  if (!state) return new Map();
  const snapshots = await readCreatorFieldsSnapshots(snapshotSources(state));
  return new Map(inspectSources(state, snapshots).filter(source => source.target).map(source => [source.id, {
    snapshot: source.snapshot,
    ...(state.typeCode === "organization"
      ? { foundedDate: source.projection?.birthDate ?? null }
      : { birthDate: source.projection?.birthDate ?? null, deathDate: source.projection?.deathDate ?? null }),
    diagnostics: source.invalid ? ["Не удалось разобрать профиль."] : (source.projection?.diagnostics ?? []).map(code => diagnosticMessage(code, source.projection?.reviewDates)),
  }]));
}
