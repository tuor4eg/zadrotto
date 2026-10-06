import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { isCoverProviderCode } from "@/lib/covers/types";
import type { GenreProviderVariantGroup } from "@/lib/media/admin-genres";

export function GenreProviderVariants({ groups }: { groups: readonly GenreProviderVariantGroup[] }) {
  if (groups.length === 0) return <p className="text-sm text-stone-500">Нет соответствий провайдеров</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {groups.map((group) => (
        <li key={`${group.provider}:${group.mediaType}`} className="min-w-0">
          <div className="text-xs font-medium text-stone-500">
            {isCoverProviderCode(group.provider) ? COVER_PROVIDER_LABELS[group.provider] : group.provider}
            {" · "}{group.mediaTypeName}
          </div>
          <div className="break-words text-stone-800">{group.names.join(", ")}</div>
        </li>
      ))}
    </ul>
  );
}
