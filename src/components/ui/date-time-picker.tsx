"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Input, Label } from "@/components/ui/form";

type DateTimePickerProps = {
  defaultValue?: string;
  label: string;
  name: string;
  timeZoneLabel?: string;
};

function splitDateTime(value?: string) {
  const [date = "", time = ""] = value?.split("T") ?? [];
  return { date, time };
}

function formatDateForDisplay(value: string) {
  return value.replaceAll("-", "/");
}

function parseDisplayDate(value: string) {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return "";

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
  ) return "";

  return `${year}-${month}-${day}`;
}

function parseDisplayTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";

  const [, hours, minutes] = match;
  if (Number(hours) > 23 || Number(minutes) > 59) return "";
  return value;
}

export function DateTimePicker({
  defaultValue,
  label,
  name,
  timeZoneLabel,
}: DateTimePickerProps) {
  const id = useId();
  const initialValue = splitDateTime(defaultValue);
  const nativeDateInputRef = useRef<HTMLInputElement>(null);
  const nativeTimeInputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(initialValue.date);
  const [dateText, setDateText] = useState(formatDateForDisplay(initialValue.date));
  const [time, setTime] = useState(initialValue.time);
  const [timeText, setTimeText] = useState(initialValue.time);
  const value = date && time ? `${date}T${time}` : "";

  return (
    <fieldset className="grid gap-2 rounded-lg border border-stone-200 bg-stone-50/70 p-3 shadow-xs transition-colors focus-within:border-stone-400 focus-within:bg-white">
      <legend className="px-1 text-sm font-medium text-stone-800">
        {label}
        {timeZoneLabel ? <span className="ml-1 font-normal text-stone-500">({timeZoneLabel})</span> : null}
      </legend>
      <input name={name} type="hidden" value={value} />
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
        <div className="relative min-w-0">
          <Label className="sr-only" htmlFor={`${id}-date`}>Дата {label.toLowerCase()}</Label>
          <Input
            className="min-w-0 pr-10 tabular-nums"
            id={`${id}-date`}
            inputMode="numeric"
            maxLength={10}
            onChange={(event) => {
              const nextDateText = event.currentTarget.value;
              const nextDate = parseDisplayDate(nextDateText);
              event.currentTarget.setCustomValidity(nextDateText && !nextDate ? "Укажите существующую дату." : "");
              setDateText(nextDateText);
              setDate(nextDate);
            }}
            pattern="[0-9]{4}/[0-9]{2}/[0-9]{2}"
            placeholder="ГГГГ/ММ/ДД"
            required
            type="text"
            value={dateText}
          />
          <input
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 size-px -translate-y-1/2 opacity-0"
            onChange={(event) => {
              const dateTextInput = document.getElementById(`${id}-date`) as HTMLInputElement | null;
              dateTextInput?.setCustomValidity("");
              setDate(event.currentTarget.value);
              setDateText(formatDateForDisplay(event.currentTarget.value));
            }}
            ref={nativeDateInputRef}
            tabIndex={-1}
            type="date"
            value={date}
          />
          <button
            aria-label={`Выбрать дату ${label.toLowerCase()}`}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20"
            onClick={() => nativeDateInputRef.current?.showPicker()}
            type="button"
          >
            <CalendarDays aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="relative min-w-0">
          <Label className="sr-only" htmlFor={`${id}-time`}>Время {label.toLowerCase()}</Label>
          <Input
            className="min-w-0 pr-10 tabular-nums"
            id={`${id}-time`}
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => {
              const nextTimeText = event.currentTarget.value;
              const nextTime = parseDisplayTime(nextTimeText);
              event.currentTarget.setCustomValidity(nextTimeText && !nextTime ? "Укажите корректное время." : "");
              setTimeText(nextTimeText);
              setTime(nextTime);
            }}
            pattern="[0-9]{2}:[0-9]{2}"
            placeholder="ЧЧ:ММ"
            required
            type="text"
            value={timeText}
          />
          <input
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 size-px -translate-y-1/2 opacity-0"
            onChange={(event) => {
              const timeTextInput = document.getElementById(`${id}-time`) as HTMLInputElement | null;
              timeTextInput?.setCustomValidity("");
              setTime(event.currentTarget.value);
              setTimeText(event.currentTarget.value);
            }}
            ref={nativeTimeInputRef}
            tabIndex={-1}
            type="time"
            value={time}
          />
          <button
            aria-label={`Выбрать время ${label.toLowerCase()}`}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20"
            onClick={() => nativeTimeInputRef.current?.showPicker()}
            type="button"
          >
            <Clock3 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </fieldset>
  );
}
