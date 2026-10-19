"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { getPlatformLogoUrl } from "@/lib/platforms/logo-url";

type LogoChoice = { key: string; provider: string; name: string; objectKey: string };

function DecisionButtons({ selected }: { selected: boolean }) {
  const { pending } = useFormStatus();
  return <div className="flex flex-wrap gap-2">
    <Button type="submit" name="decision" value="map" disabled={!selected || pending}>Использовать выбранное</Button>
    <Button type="submit" name="decision" value="exclude" variant="outline" disabled={pending}>Без логотипа</Button>
  </div>;
}

export function PlatformLogoChoiceForm({ requestId, candidates, selectedCandidateKey, action }: {
  requestId: number; candidates: readonly LogoChoice[]; selectedCandidateKey?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState(selectedCandidateKey ?? "");
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="requestId" value={requestId} />
    <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <legend className="sr-only">Выберите логотип</legend>
      {candidates.map(candidate => {
        const src = getPlatformLogoUrl(candidate.objectKey);
        if (!src) return null;
        return <label key={candidate.key} className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 ${selected === candidate.key ? "border-stone-900 bg-stone-100 ring-1 ring-stone-900" : "border-stone-200 bg-white"}`}>
          <input type="radio" name="candidateKey" value={candidate.key} checked={selected === candidate.key} onChange={() => setSelected(candidate.key)} className="size-4 accent-stone-900" aria-label={`${candidate.name} · ${candidate.provider.toUpperCase()}`} />
          <Image src={src} alt={`Логотип ${candidate.name}`} width={144} height={144} unoptimized className="h-28 w-full object-contain p-2" />
          <span className="break-words text-sm">{candidate.name}</span>
          <span className="text-xs text-stone-500">{candidate.provider.toUpperCase()}</span>
        </label>;
      })}
    </fieldset>
    <DecisionButtons selected={candidates.some(candidate => candidate.key === selected && Boolean(getPlatformLogoUrl(candidate.objectKey)))} />
  </form>;
}
