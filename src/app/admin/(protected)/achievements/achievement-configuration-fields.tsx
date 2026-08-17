"use client";

import { useState } from "react";

import { Label, Select } from "@/components/ui/form";

type MechanicOption = {
  code: string;
  label: string;
  params: { code: string; label: string; type: "mediaType" | "series" }[];
};

export function AchievementConfigurationFields({
  conditionLocked = false,
  initialMechanic,
  initialParams,
  mechanics,
  mediaTypes,
  series,
}: {
  conditionLocked?: boolean;
  initialMechanic: string;
  initialParams: Record<string, unknown>;
  mechanics: MechanicOption[];
  mediaTypes: { code: string; name: string }[];
  series: { id: number; title: string }[];
}) {
  const [mechanicCode, setMechanicCode] = useState(initialMechanic);
  const mechanic = mechanics.find((item) => item.code === mechanicCode) ?? mechanics[0];

  return <>
    {conditionLocked ? <p className="text-sm text-stone-600">Механика и параметры заблокированы после первой выдачи.</p> : null}
    {conditionLocked ? <input type="hidden" name="mechanic" value={initialMechanic} /> : null}
    {conditionLocked ? mechanic?.params.map((parameter) => (
      <input key={parameter.code} type="hidden" name={parameter.code} value={String(initialParams[parameter.code] ?? "")} />
    )) : null}
    <div className="grid gap-2">
      <Label htmlFor="achievement-mechanic">Механика</Label>
      <Select
        id="achievement-mechanic"
        name="mechanic"
        value={mechanicCode}
        disabled={conditionLocked}
        onChange={(event) => setMechanicCode(event.target.value)}
      >
        {mechanics.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </Select>
    </div>
    {mechanic?.params.map((parameter) => <div className="grid gap-2" key={parameter.code}>
      <Label htmlFor={`achievement-param-${parameter.code}`}>{parameter.label}</Label>
      <Select
        id={`achievement-param-${parameter.code}`}
        name={parameter.code}
        disabled={conditionLocked}
        defaultValue={String(initialParams[parameter.code] ?? "")}
      >
        <option value="">Без фильтра</option>
        {(parameter.type === "mediaType" ? mediaTypes : series).map((option) => parameter.type === "mediaType"
          ? <option key={(option as { code: string }).code} value={(option as { code: string }).code}>{(option as { name: string }).name}</option>
          : <option key={(option as { id: number }).id} value={(option as { id: number }).id}>{(option as { title: string }).title}</option>)}
      </Select>
    </div>)}
  </>;
}
