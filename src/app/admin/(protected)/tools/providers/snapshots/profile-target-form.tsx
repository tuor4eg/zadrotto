"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { enqueueProviderSnapshotAction } from "./actions";

function ProfileFields({ busy }: { busy: boolean }) {
  const [provider, setProvider] = useState("tmdb");
  const { pending } = useFormStatus();
  return <fieldset disabled={busy || pending} className="grid gap-3">
    <input type="hidden" name="profileTarget" value="on" /><input type="hidden" name="operation" value="refresh" />
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-2"><Label htmlFor="profile-provider">Провайдер</Label><Select id="profile-provider" name="provider" value={provider} onChange={event => setProvider(event.target.value)}><option value="fantlab">FantLab</option><option value="tmdb">TMDB</option><option value="igdb">IGDB</option><option value="rawg">RAWG</option><option value="anilist">AniList</option></Select></div>
      <div className="grid gap-2"><Label htmlFor="profile-resource">Ресурс</Label><Select key={provider} id="profile-resource" name="resourceType">{provider === "fantlab" ? <option value="author">Автор</option> : provider === "anilist" ? <option value="person">Персона</option> : provider === "rawg" ? <><option value="developer">Разработчик</option><option value="publisher">Издатель</option></> : provider === "tmdb" ? <><option value="company">Компания</option><option value="network">Вещатель</option><option value="person">Персона</option></> : <option value="company">Компания</option>}</Select></div>
      <div className="grid gap-2"><Label htmlFor="profile-external-id">Внешний ID</Label><Input id="profile-external-id" name="externalId" inputMode="numeric" pattern="[1-9][0-9]*" required /></div>
    </div>
    <Button className="w-fit" type="submit">{pending ? "Запускаем…" : "Получить raw без Creator"}</Button>
  </fieldset>;
}

export function ProfileTargetForm({ busy = false }: { busy?: boolean }) {
  return <section className="space-y-3 rounded-md border p-4"><h3 className="font-semibold">Профиль по внешнему ID</h3><p className="text-sm text-stone-600">Сохраняет полный ответ без локальной сущности. Рабочие данные не изменяются. После создания Creator снимок можно связать с подтверждённым источником без повторной загрузки.</p><form action={enqueueProviderSnapshotAction}><ProfileFields busy={busy} /></form></section>;
}
