"use client";

import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ADMIN_EXPORT_FIELDS, getAvailableMetadataExportFields, getDefaultAdminExportFields, getMetadataExportFieldKey, type AdminExportEntityType, type MediaMetadataExportFieldKey } from "@/lib/admin-exports/model";
import { createAdminExportAction } from "./actions";

export function ExportDialog({
  entityType,
  filters,
  sort,
  totalCount,
}: {
  entityType: AdminExportEntityType;
  filters: Record<string, unknown>;
  sort: string;
  totalCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMetadataFields, setSelectedMetadataFields] = useState<Set<MediaMetadataExportFieldKey>>(() => new Set());
  const metadataToggleRef = useRef<HTMLInputElement>(null);
  const defaults = new Set<string>(getDefaultAdminExportFields(entityType));
  const title = entityType === "media_items" ? "Экспорт записей" : "Экспорт серий";
  const selectedMediaTypes = typeof filters.mediaType === "string"
    ? [filters.mediaType]
    : Array.isArray(filters.mediaType)
      ? filters.mediaType.filter((value): value is string => typeof value === "string")
      : [];
  const metadataFields = entityType === "media_items"
    ? getAvailableMetadataExportFields(selectedMediaTypes)
    : [];
  const allMetadataSelected = metadataFields.length > 0 && selectedMetadataFields.size === metadataFields.length;
  const someMetadataSelected = selectedMetadataFields.size > 0 && !allMetadataSelected;

  useEffect(() => {
    if (metadataToggleRef.current) metadataToggleRef.current.indeterminate = someMetadataSelected;
  }, [someMetadataSelected]);

  function openDialog() {
    setSelectedMetadataFields(new Set());
    setIsOpen(true);
  }

  function toggleAllMetadata() {
    setSelectedMetadataFields(allMetadataSelected
      ? new Set()
      : new Set(metadataFields.map((field) => getMetadataExportFieldKey(field.key))));
  }

  function toggleMetadataField(fieldKey: MediaMetadataExportFieldKey) {
    setSelectedMetadataFields((current) => {
      const next = new Set(current);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <Download /> Экспортировать
      </Button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4">
          <button type="button" aria-label="Закрыть окно" className="absolute inset-0" onClick={() => setIsOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="export-dialog-title" className="text-xl font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-stone-600">В CSV попадут все строки текущей выборки: {totalCount}.</p>
              </div>
              <button type="button" className="rounded-md p-2 text-stone-500 hover:bg-stone-100" aria-label="Закрыть" onClick={() => setIsOpen(false)}><X className="size-4" /></button>
            </div>
            <form action={createAdminExportAction} className="mt-5 grid gap-5">
              <input type="hidden" name="entityType" value={entityType} />
              <input type="hidden" name="filters" value={JSON.stringify(filters)} />
              <input type="hidden" name="sort" value={sort} />
              <fieldset className="rounded-md border border-stone-200 p-3">
                <legend className="px-1 text-sm font-medium text-stone-900">Поля CSV</legend>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {ADMIN_EXPORT_FIELDS[entityType].map((field) => (
                    <label key={field.key} className="flex items-center gap-2 px-1 py-2 text-sm">
                      <input type="checkbox" name="fields" value={field.key} defaultChecked={defaults.has(field.key)} />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
                {entityType === "media_items" ? (
                  <div className="mt-3 border-t border-stone-200 pt-3">
                    <label className="flex items-center gap-2 px-1 py-2 text-sm font-medium">
                      <input
                        ref={metadataToggleRef}
                        type="checkbox"
                        checked={allMetadataSelected}
                        onChange={toggleAllMetadata}
                      />
                      <span>Метаданные</span>
                    </label>
                    <div className="ml-2 grid gap-x-4 gap-y-1 border-l border-stone-200 pl-4 sm:grid-cols-2">
                      {metadataFields.map((field) => {
                        const fieldKey = getMetadataExportFieldKey(field.key);
                        return (
                          <label key={field.key} className="flex items-center gap-2 px-1 py-2 text-sm">
                            <input
                              type="checkbox"
                              name="fields"
                              value={fieldKey}
                              checked={selectedMetadataFields.has(fieldKey)}
                              onChange={() => toggleMetadataField(fieldKey)}
                            />
                            <span>{field.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </fieldset>
              <p className="text-xs leading-5 text-stone-500">Файл будет сформирован фоновой задачей. Статус и скачивание появятся в истории экспортов.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Отмена</Button>
                <Button type="submit">Запустить экспорт</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
