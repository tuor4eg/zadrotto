"use client"

import { useState } from "react"

import { SearchableFranchiseSelect } from "@/components/ui/searchable-franchise-select"
import { Label, Select } from "@/components/ui/form"

type MechanicOption = {
  code: string
  label: string
  params: { code: string; label: string; type: "mediaType" | "series" }[]
}

type SeriesOption = {
  id: number
  originalTitle: string | null
  title: string
}

function SeriesFilterField({
  id,
  initialValue,
  locked,
  name,
  series,
}: {
  id: string
  initialValue: string
  locked: boolean
  name: string
  series: SeriesOption[]
}) {
  const [value, setValue] = useState(initialValue)
  const selected = series.find((item) => String(item.id) === (locked ? initialValue : value))

  if (locked) {
    return <p className="text-sm text-stone-700">{selected?.title ?? "Без фильтра"}</p>
  }

  return (
    <SearchableFranchiseSelect
      emptyLabel="Без фильтра"
      id={id}
      name={name}
      options={series}
      value={value}
      onChange={setValue}
    />
  )
}

export function AchievementConfigurationFields({
  conditionLocked = false,
  initialMechanic,
  initialParams,
  mechanics,
  mediaTypes,
  series,
}: {
  conditionLocked?: boolean
  initialMechanic: string
  initialParams: Record<string, unknown>
  mechanics: MechanicOption[]
  mediaTypes: { code: string; name: string }[]
  series: SeriesOption[]
}) {
  const [mechanicCode, setMechanicCode] = useState(initialMechanic)
  const mechanic = mechanics.find((item) => item.code === mechanicCode) ?? mechanics[0]

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
      {parameter.type === "series" ? (
        <SeriesFilterField
          id={`achievement-param-${parameter.code}`}
          initialValue={String(initialParams[parameter.code] ?? "")}
          locked={conditionLocked}
          name={parameter.code}
          series={series}
        />
      ) : (
        <Select
          id={`achievement-param-${parameter.code}`}
          name={parameter.code}
          disabled={conditionLocked}
          defaultValue={String(initialParams[parameter.code] ?? "")}
        >
          <option value="">Без фильтра</option>
          {mediaTypes.map((option) => (
            <option key={option.code} value={option.code}>{option.name}</option>
          ))}
        </Select>
      )}
    </div>)}
  </>
}
