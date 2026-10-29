import Link from "next/link";
import type { PublicCreatorMediaTypeTab } from "@/db/queries/creators";

export function CreatorMediaTypeChips({ mediaTypes, selectedMediaType, selectedRoles, searchQuery, pageSize }: {
  mediaTypes: readonly PublicCreatorMediaTypeTab[];
  selectedMediaType?: string;
  selectedRoles: readonly string[];
  searchQuery: string;
  pageSize?: number;
}) {
  const href = (type: string, roles: readonly string[] = []) => {
    const params = new URLSearchParams({ type });
    if (roles.length) params.set("role", roles.join(","));
    if (searchQuery) params.set("q", searchQuery);
    if (pageSize) params.set("pageSize", String(pageSize));
    return `/creators?${params}`;
  };
  return <nav aria-label="Типы медиа и роли создателей" className="mt-4 flex flex-wrap items-start gap-2">
    {mediaTypes.map(type => {
      const selected = type.code === selectedMediaType;
      return <div key={type.code} className={`flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border p-1 ${selected ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700"}`}>
        <Link href={href(type.code)} aria-current={selected && !selectedRoles.length ? "page" : undefined}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors hover:opacity-80">
          {type.name}<span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums" aria-label={`Создателей: ${type.creatorsCount}`}>{type.creatorsCount}</span>
        </Link>
        {selected && <>
          {type.roles.map(role => <Link key={role.code} href={href(type.code, selectedRoles.includes(role.code) ? selectedRoles.filter(code => code !== role.code) : [...selectedRoles, role.code])} aria-current={selectedRoles.includes(role.code) ? "true" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-colors ${selectedRoles.includes(role.code) ? "bg-stone-50 text-stone-950" : "bg-white/10 text-stone-100 hover:bg-white/20"}`}>
            {role.name}<span className="tabular-nums" aria-label={`Создателей: ${role.creatorsCount}`}>{role.creatorsCount}</span>
          </Link>)}
        </>}
      </div>;
    })}
  </nav>;
}
