import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { TierConfiguration, TierTemplate } from "@/lib/tier-lists/model";
import { deleteTemplateAction } from "../../tier-lists/actions";

function LevelColors({ configuration }: { configuration: TierConfiguration }) {
  return <div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-1 text-xs"><span style={{ backgroundColor: configuration.backgroundColor ?? '#20201d' }} className="size-4 rounded-sm border border-black/10" />Фон {configuration.backgroundColor ?? '#20201d'}</span>{configuration.levels.map(level => (
    <span key={level.id} title={`${level.name}: ${level.color}`} className="inline-flex items-center gap-1.5 rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700">
      <span aria-label={`Цвет ${level.color}`} style={{ backgroundColor: level.color }} className="size-4 shrink-0 rounded-sm border border-black/10" />
      <span className="break-words">{level.name}</span>
    </span>
  ))}</div>;
}

function TemplateActions({ template }: { template: TierTemplate }) {
  return <div className="flex items-center justify-end gap-2">
    <Link href={`/admin/settings/tier-lists/templates/${template.id}/edit`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Редактировать шаблон «${template.name}»`}><Pencil /></Link>
    <ConfirmAction action={deleteTemplateAction} fields={[{ name: "id", value: template.id }]}
      title="Удалить шаблон?" description="Созданные по этому шаблону тир-листы сохранят свои уровни и цвета."
      triggerLabel="Удалить" triggerAriaLabel={`Удалить шаблон «${template.name}»`} triggerIcon={<Trash2 />} triggerSize="icon"
      confirmLabel="Удалить" disabled={template.isDefault} />
  </div>;
}

export function TierTemplateTable({ templates }: { templates: TierTemplate[] }) {
  return <section className="grid gap-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Шаблоны</h2>
      <Link href="/admin/settings/tier-lists/templates/new" className={buttonVariants()}><Plus />Добавить шаблон</Link>
    </header>
    {templates.length ? <>
      <TableWrap className="hidden md:block"><Table>
        <THead><tr><TH>Название</TH><TH>Уровни и цвета</TH><TH>По умолчанию</TH><TH className="text-right">Действия</TH></tr></THead>
        <TBody>{templates.map(template => <TR key={template.id}>
          <TD className="font-medium"><Link href={`/admin/settings/tier-lists/templates/${template.id}/edit`} className="hover:underline">{template.name}</Link></TD>
          <TD><LevelColors configuration={template.configuration} /></TD>
          <TD>{template.isDefault ? <Badge>По умолчанию</Badge> : <span className="text-stone-400">—</span>}</TD>
          <TD><TemplateActions template={template} /></TD>
        </TR>)}</TBody>
      </Table></TableWrap>
      <div className="grid gap-3 md:hidden">{templates.map(template => <article key={template.id} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2"><Link href={`/admin/settings/tier-lists/templates/${template.id}/edit`} className="font-medium">{template.name}</Link>{template.isDefault ? <Badge>По умолчанию</Badge> : null}</div>
        <LevelColors configuration={template.configuration} />
        <TemplateActions template={template} />
      </article>)}</div>
    </> : <p className="rounded-lg border border-dashed border-stone-200 p-5 text-sm text-stone-500">Шаблонов пока нет.</p>}
  </section>;
}
