"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label } from "@/components/ui/form";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { saveCreatorDictionaryAction, deleteCreatorDictionaryAction } from "./actions";

type DictionaryRow = { id: number; name: string; code: string };

function DictionaryActions({ kind, row, edit }: { kind: "type" | "role"; row: DictionaryRow; edit: () => void }) {
  return <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" variant="outline" onClick={edit}><Pencil/>Редактировать</Button>
    <ConfirmAction action={deleteCreatorDictionaryAction} fields={[{name:"kind",value:kind},{name:"id",value:row.id}]}
      title="Удалить значение?" description={`Значение «${row.name}» будет удалено. Используемое значение удалить нельзя.`}
      triggerLabel="Удалить" triggerIcon={<Trash2/>} confirmLabel="Удалить"/>
  </div>;
}

export function CreatorDictionary({ kind, rows }: { kind: "type" | "role"; rows: DictionaryRow[] }) {
  const [editor, setEditor] = useState<DictionaryRow | "new" | null>(null);
  const existing = editor && editor !== "new" ? editor : null;
  const close = () => setEditor(null);
  return <div className="grid gap-5">
    <div><Button onClick={() => setEditor("new")} type="button"><Plus/>Добавить {kind === "type" ? "тип" : "роль"}</Button></div>
    {rows.length === 0 ? <p className="rounded-lg border p-5 text-sm text-stone-500">Значения пока не добавлены.</p> : <>
      <div className="grid gap-3 md:hidden">{rows.map(row => <article key={row.id} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="break-words font-medium">{row.name}</h2><p className="break-all font-mono text-xs text-stone-500">{row.code}</p>
        <DictionaryActions kind={kind} row={row} edit={() => setEditor(row)}/>
      </article>)}</div>
      <TableWrap className="hidden md:block"><Table className="table-fixed"><THead><TR><TH>Название</TH><TH className="w-1/4">Code</TH><TH className="w-72">Действия</TH></TR></THead>
        <TBody>{rows.map(row => <TR key={row.id}><TD className="break-words font-medium">{row.name}</TD><TD className="break-all font-mono text-xs">{row.code}</TD><TD><DictionaryActions kind={kind} row={row} edit={() => setEditor(row)}/></TD></TR>)}</TBody>
      </Table></TableWrap>
    </>}
    {editor ? <ConfirmDialog title={existing ? "Редактирование значения" : kind === "type" ? "Новый тип создателя" : "Новая роль создателя"}
      description="Code задаётся вручную при создании и больше не меняется." onClose={close}>
      <form action={saveCreatorDictionaryAction} className="grid w-full gap-4">
        <input type="hidden" name="kind" value={kind}/>{existing ? <input type="hidden" name="id" value={existing.id}/> : null}
        <div className="grid gap-2"><Label htmlFor="creator-dictionary-name">Название</Label><Input id="creator-dictionary-name" name="name" defaultValue={existing?.name} required maxLength={200} autoFocus/></div>
        <div className="grid gap-2"><Label htmlFor="creator-dictionary-code">Code</Label><Input id="creator-dictionary-code" name="code" defaultValue={existing?.code} readOnly={Boolean(existing)} required maxLength={200} pattern="[a-z][a-z0-9_]*"/></div>
        <div className="flex justify-end"><Button type="submit">{existing ? "Сохранить" : "Добавить"}</Button></div>
      </form>
    </ConfirmDialog> : null}
  </div>;
}
