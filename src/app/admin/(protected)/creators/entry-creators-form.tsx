"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { saveEntryCreatorsAction } from "./actions";

export function EntryCreatorsForm({entryId,creators,roles,links}: {
  entryId:number; creators:{id:number;name:string}[]; roles:{id:number;name:string}[];
  links:{id:number;name:string;roleId:number;roleName:string;isManual:boolean;hasProviderSource:boolean}[];
}) {
  const [pairs,setPairs] = useState(links.filter(link => link.isManual).map(link => ({creatorId:String(link.id),roleId:String(link.roleId)})));
  return <form id={`entry-creators-${entryId}`} action={saveEntryCreatorsAction} className="grid gap-3"><input type="hidden" name="entryId" value={entryId}/>
    {links.some(link => link.hasProviderSource) ? <p className="text-sm text-stone-500">Из провайдеров: {links.filter(link => link.hasProviderSource).map(link => `${link.name} (${link.roleName})`).join(", ")}</p> : null}
    {pairs.map((pair,index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Select aria-label="Создатель" name="creatorId" value={pair.creatorId} onChange={event => setPairs(items => items.map((item,i) => i === index ? {...item,creatorId:event.target.value} : item))}><option value="">Выберите создателя</option>{creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</Select>
      <Select aria-label="Роль" name="roleId" value={pair.roleId} onChange={event => setPairs(items => items.map((item,i) => i === index ? {...item,roleId:event.target.value} : item))}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</Select>
      <Button type="button" variant="outline" onClick={() => setPairs(items => items.filter((_,i) => i !== index))}>Убрать</Button>
    </div>)}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPairs(items => [...items,{creatorId:"",roleId:String(roles[0]?.id ?? "")}])}>Добавить создателя</Button></div>
  </form>;
}
