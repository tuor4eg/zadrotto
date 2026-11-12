"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { DEFAULT_TIER_CONFIGURATION, tierBackground, type TierConfiguration, type TierLevel } from "@/lib/tier-lists/model";
import { AdminToasts } from "../../admin-toasts";
import { saveTemplateAction } from "../../tier-lists/actions";

export type TierTemplateFormValue = { id: number; name: string; configuration: TierConfiguration; isDefault: boolean };

export function TierTemplateForm({ template, maxLevels }: { template?: TierTemplateFormValue; maxLevels: number }) {
  const [backgroundColor, setBackgroundColor] = useState(tierBackground(template?.configuration ?? DEFAULT_TIER_CONFIGURATION));
  const [name, setName] = useState(template?.name ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [state, action, pending] = useActionState(saveTemplateAction, { error: null, submissionId: 0 });
  const [levels, setLevels] = useState<TierLevel[]>(() => (template?.configuration.levels ?? DEFAULT_TIER_CONFIGURATION.levels.slice(0, maxLevels)).map(level => ({ ...level })));

  function updateLevel(id: string, patch: Partial<Pick<TierLevel, "name" | "color">>) {
    setLevels(current => current.map(level => level.id === id ? { ...level, ...patch } : level));
  }
  function moveLevel(index: number, step: number) {
    setLevels(current => {
      const next = [...current];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }

  return <form action={action} className="grid gap-5">
    <AdminToasts messages={state.error ? [{ id: `template-error-${state.submissionId}`, tone: "error", text: state.error }] : []} />
    <input type="hidden" name="id" value={template?.id ?? ""} />
    <input type="hidden" name="levels" value={JSON.stringify(levels)} />
    <fieldset disabled={pending} className="grid min-w-0 gap-5 rounded-lg border border-stone-200 bg-white p-5">
      <label className="grid gap-2 text-sm font-medium">Название<Input name="name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-medium">Цвет фона<div className="flex items-center gap-2">
        <Input type="color" aria-label="Выбрать цвет фона" className="w-14 shrink-0 cursor-pointer p-1" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : '#20201d'} onChange={event => setBackgroundColor(event.target.value)} />
        <Input name="backgroundColor" aria-label="HEX цвета фона" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={backgroundColor} className="max-w-40 font-mono" onChange={event => setBackgroundColor(event.target.value)} />
      </div></label>
      <div className="grid gap-3">
        <div><h3 className="text-sm font-medium">Уровни и цвета</h3><p className="mt-1 text-xs text-stone-500">Сверху — высший уровень. Максимум уровней: {maxLevels}.</p></div>
        {levels.map((level, index) => <div key={level.id} className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="grid min-w-0 gap-2 text-sm font-medium">Название уровня {index + 1}<Input required maxLength={40} value={level.name} onChange={event => updateLevel(level.id, { name: event.target.value })} /></label>
          <div className="grid gap-2"><span className="text-sm font-medium">Цвет</span><div className="flex items-center gap-2">
            <Input type="color" aria-label={`Выбрать цвет уровня ${index + 1}`} className="w-14 shrink-0 cursor-pointer p-1" value={/^#[0-9a-f]{6}$/i.test(level.color) ? level.color : "#000000"} onChange={event => updateLevel(level.id, { color: event.target.value })} />
            <Input aria-label={`HEX цвета уровня ${index + 1}`} required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={level.color} className="min-w-0 font-mono" onChange={event => updateLevel(level.id, { color: event.target.value })} />
          </div></div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" disabled={index === 0} aria-label={`Поднять уровень ${index + 1}`} onClick={() => moveLevel(index, -1)}><ArrowUp /></Button>
            <Button type="button" variant="outline" size="icon" disabled={index === levels.length - 1} aria-label={`Опустить уровень ${index + 1}`} onClick={() => moveLevel(index, 1)}><ArrowDown /></Button>
            <Button type="button" variant="outline" size="icon" disabled={levels.length === 1} aria-label={`Удалить уровень ${index + 1}`} onClick={() => setLevels(current => current.filter(row => row.id !== level.id))}><Trash2 /></Button>
          </div>
        </div>)}
        <Button type="button" variant="outline" className="w-fit" disabled={levels.length >= maxLevels} onClick={() => setLevels(current => [...current, { id: crypto.randomUUID(), name: "", color: "#cbd5e1" }])}><Plus />Добавить уровень</Button>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
        {template?.isDefault ? <input type="hidden" name="isDefault" value="1" /> : null}
        <input type="checkbox" name={template?.isDefault ? undefined : "isDefault"} value="1" checked={isDefault} onChange={event => setIsDefault(event.target.checked)} disabled={template?.isDefault || pending} />По умолчанию
      </label>
      <p className="text-xs text-stone-500">Чтобы сменить шаблон по умолчанию, отметьте другой. Уже созданные тир-листы сохранят свои уровни и цвета.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit">{pending ? "Сохраняем…" : template ? "Сохранить шаблон" : "Создать шаблон"}</Button><Link href="/admin/settings/tier-lists" className={buttonVariants({ variant: "outline" })}>Отмена</Link></div>
    </fieldset>
  </form>;
}
