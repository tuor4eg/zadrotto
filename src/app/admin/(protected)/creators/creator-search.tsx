"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

type FilterOption = { code: string; name: string };

export function CreatorSearch({ searchQuery, typeCode, roleCode, types, roles }: {
  searchQuery: string;
  typeCode: string;
  roleCode: string;
  types: FilterOption[];
  roles: FilterOption[];
}) {
  const router = useRouter();
  const filtersRef = useRef<HTMLDivElement>(null);
  function applyFilters(query: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const type = filtersRef.current?.querySelector<HTMLSelectElement>('[name="type"]')?.value ?? typeCode;
    const role = filtersRef.current?.querySelector<HTMLSelectElement>('[name="role"]')?.value ?? roleCode;
    if (type) params.set("type", type);
    if (role) params.set("role", role);
    const suffix = params.toString();
    router.replace(suffix ? `/admin/creators?${suffix}` : "/admin/creators", { scroll: false });
  }
  const { draft, setDraft, resetDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: applyFilters,
  });

  return <div ref={filtersRef} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
    <label className="grid gap-1 text-sm">Тип
      <Select key={typeCode} name="type" defaultValue={typeCode} onChange={() => applyFilters(draft)}>
        <option value="">Все типы</option>
        {types.map(type => <option key={type.code} value={type.code}>{type.name}</option>)}
      </Select>
    </label>
    <label className="grid gap-1 text-sm">Роль
      <Select key={roleCode} name="role" defaultValue={roleCode} onChange={() => applyFilters(draft)}>
        <option value="">Все роли</option>
        {roles.map(role => <option key={role.code} value={role.code}>{role.name}</option>)}
      </Select>
    </label>
    <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
      placeholder="Поиск по имени" aria-label="Поиск создателей" className="max-w-md" />
    {draft ? <Button type="button" variant="ghost" onClick={() => resetDraft()}>Сбросить</Button> : null}
  </div>;
}
