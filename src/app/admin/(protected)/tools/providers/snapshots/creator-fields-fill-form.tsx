"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { CREATOR_FIELDS_FILL_PROVIDERS, CREATOR_FILL_FIELD_LABELS, isCreatorFieldsFillProvider, type CreatorFieldsFillProvider } from "@/lib/creators/fields-fill-payload";
import { SNAPSHOT_DEFAULT_BATCH_SIZE, SNAPSHOT_MAX_BATCH_SIZE, SNAPSHOT_MAX_PAUSE_HOURS } from "@/lib/providers/snapshot-job-payload";
import { enqueueCreatorFieldsFillAction } from "./creator-fields-fill-actions";

function FillButton({ busy, single }: { busy: boolean; single: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={single ? "outline" : "default"} disabled={busy || pending}>
    {pending ? "Запускаем…" : single ? "Заполнить из источников" : "Заполнить пропуски"}
  </Button>;
}

export function CreatorFieldsFillForm({ creatorId, busy = false, providerCoverage = [], initialProviders }: {
  creatorId?: number;
  busy?: boolean;
  providerCoverage?: { provider: keyof typeof COVER_PROVIDER_LABELS; missingSnapshots: number }[];
  initialProviders?: CreatorFieldsFillProvider[];
}) {
  const [providers, setProviders] = useState<readonly CreatorFieldsFillProvider[]>(initialProviders ?? CREATOR_FIELDS_FILL_PROVIDERS);
  const single = creatorId !== undefined;
  const fields = [
    { value: "birthOrFoundedDate", label: "Дата рождения / основания" },
    { value: "deathDate", label: CREATOR_FILL_FIELD_LABELS.deathDate },
  ];
  return <form action={enqueueCreatorFieldsFillAction.bind(null, creatorId ?? null)} className="grid justify-items-start gap-3">
    {single ? null : <>
      <details className="w-full rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Недостающие снимки по провайдерам · выбрано {providers.length}</summary>
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setProviders(CREATOR_FIELDS_FILL_PROVIDERS)}>Выбрать все</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setProviders([])}>Снять выбор</Button>
          </div>
          <TableWrap>
            <Table aria-label="Недостающие снимки по провайдерам">
              <THead><TR><TH scope="col">Провайдер</TH><TH scope="col" className="text-right">Недостающие снимки</TH></TR></THead>
              <TBody>{providerCoverage.map(({ provider, missingSnapshots }) => {
                const supported = isCreatorFieldsFillProvider(provider);
                const label = COVER_PROVIDER_LABELS[provider];
                return <TR key={provider}>
                  <TD>
                    {supported ? <label className="flex items-center gap-2">
                      <input type="checkbox" name="providers" value={provider} checked={providers.includes(provider)} disabled={busy}
                        onChange={event => {
                          const checked = event.currentTarget.checked;
                          setProviders(current => checked ? [...current, provider] : current.filter(value => value !== provider));
                        }} />
                      {label}
                    </label> : <>{label} <span className="text-xs text-stone-500">· даты недоступны</span></>}
                  </TD>
                  <TD className="text-right tabular-nums">{missingSnapshots.toLocaleString("ru-RU")}</TD>
                </TR>;
              })}</TBody>
            </Table>
          </TableWrap>
          <p className="text-xs text-stone-500">Считаются действующие привязки. При заполнении даты сравниваются только между выбранными провайдерами.</p>
        </div>
      </details>
      <fieldset className="grid gap-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">Поля для заполнения</legend>
        {fields.map(({ value, label }) => <label key={value} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="fields" value={value} defaultChecked />
          {label}
        </label>)}
      </fieldset>
      <div className="grid w-full max-w-md gap-2">
        <Label htmlFor="fill-creator-ids">ID создателей (необязательно)</Label>
        <Input id="fill-creator-ids" name="creatorIds" placeholder="12, 34, 56" maxLength={3200} disabled={busy} />
        <p className="text-xs text-stone-500">Укажите до 200 ID через запятую или оставьте поле пустым для всех подходящих создателей.</p>
      </div>
      <fieldset className="grid w-full gap-4 sm:grid-cols-2" disabled={busy}>
        <div className="grid content-start gap-2">
          <Label htmlFor="fill-batch-size">Создателей в одной партии</Label>
          <Input id="fill-batch-size" name="batchSize" type="number" min="1" max={SNAPSHOT_MAX_BATCH_SIZE} step="1" required defaultValue={SNAPSHOT_DEFAULT_BATCH_SIZE} />
          <p className="text-xs text-stone-500">От 1 до {SNAPSHOT_MAX_BATCH_SIZE}. По умолчанию — {SNAPSHOT_DEFAULT_BATCH_SIZE}.</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="fill-batch-pause">Пауза между партиями, часы</Label>
          <Input id="fill-batch-pause" name="batchPauseHours" type="number" min="0" max={SNAPSHOT_MAX_PAUSE_HOURS} step="any" required defaultValue={0} />
          <p className="text-xs text-stone-500">0 — одна секунда. Например, 0,5 — полчаса.</p>
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="fetchMissing" disabled={busy} />
        Запрашивать недостающие снимки
      </label>
    </>}
    <FillButton busy={busy || (!single && providers.length === 0)} single={single} />
  </form>;
}
