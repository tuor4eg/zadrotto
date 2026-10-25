"use client";

import { CREATOR_PROVIDER_FILTER_CODES, type CreatorLocalizationFilter, type CreatorProviderFilter } from "@/lib/creators/editor";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

type FilterOption = { code: string; name: string };

export function CreatorSearch({ searchQuery, typeCode, roleCode, localization = "", provider = "", types, roles }: {
  searchQuery: string;
  typeCode: string;
  roleCode: string;
  localization?: CreatorLocalizationFilter;
  provider?: CreatorProviderFilter;
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
    const selectedLocalization = filtersRef.current?.querySelector<HTMLSelectElement>('[name="localization"]')?.value ?? localization;
    if (selectedLocalization) params.set("localization", selectedLocalization);
    const selectedProvider = filtersRef.current?.querySelector<HTMLSelectElement>('[name="provider"]')?.value ?? provider;
    if (selectedProvider) params.set("provider", selectedProvider);
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
    <label className="grid gap-1 text-sm">Провайдер
      <Select key={provider} name="provider" defaultValue={provider} onChange={() => applyFilters(draft)}>
        <option value="">Все провайдеры</option>
        {CREATOR_PROVIDER_FILTER_CODES.map(code => <option key={code} value={code}>{COVER_PROVIDER_LABELS[code]}</option>)}
      </Select>
    </label>
    <label className="grid gap-1 text-sm">Локализация
      <Select key={localization} name="localization" defaultValue={localization} onChange={() => applyFilters(draft)}>
        <option value="">Все создатели</option>
        <option value="localized">Есть русское имя</option>
        <option value="ai">Русское имя от ИИ</option>
      </Select>
    </label>
    <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
      placeholder="Поиск по имени" aria-label="Поиск создателей" className="max-w-md" />
    {draft ? <Button type="button" variant="ghost" onClick={() => resetDraft()}>Сбросить</Button> : null}
  </div>;
}
