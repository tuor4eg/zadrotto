"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminToasts } from "../admin-toasts";
import { saveEntryPseudonymAction } from "./actions";

type Candidate = { id: number; name: string };

export function EntryPseudonymPicker({ entryId, selected }: {
  entryId: number;
  selected: (Candidate & { isComplete: boolean }) | null;
}) {
  if (!selected) return null;
  return <section className="grid gap-3">
    {!selected.isComplete ? <AdminToasts messages={[{ id: `pseudonym-incomplete-${entryId}-${selected.id}`, tone: "error", text: "В записи больше нет полного состава авторов выбранного псевдонима. Выбор сохранён; проверьте его или отмените." }]}/> : null}
    {selected ? <div className="grid gap-3 rounded-md border p-4">
      <h3 className="font-medium">Отображаемый псевдоним: <Link href={`/admin/creators/${selected.id}/edit`} className="underline">{selected.name}</Link></h3>
      <form action={saveEntryPseudonymAction}><input type="hidden" name="entryId" value={entryId}/><input type="hidden" name="creatorId" value=""/><Button type="submit" variant="outline">Отменить выбор псевдонима</Button></form>
    </div> : null}
  </section>;
}
