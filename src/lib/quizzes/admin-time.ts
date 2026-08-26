const MOSCOW_UTC_OFFSET_HOURS = 3;
const MOSCOW_NOON_UTC_HOUR = 12 - MOSCOW_UTC_OFFSET_HOURS;
const DATE_TIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function getDefaultQuizPeriod(now = new Date()) {
  const moscowNow = new Date(now.getTime() + MOSCOW_UTC_OFFSET_HOURS * 60 * 60_000);
  const startDayOffset = moscowNow.getUTCHours() < 12 ? 0 : 1;
  const startsAt = new Date(Date.UTC(
    moscowNow.getUTCFullYear(),
    moscowNow.getUTCMonth(),
    moscowNow.getUTCDate() + startDayOffset,
    MOSCOW_NOON_UTC_HOUR,
  ));
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);

  return { startsAt, endsAt };
}

export function formatMoscowDateTimeLocal(value?: Date | null) {
  if (!value) return "";

  const moscowTime = new Date(value.getTime() + MOSCOW_UTC_OFFSET_HOURS * 60 * 60_000);
  return moscowTime.toISOString().slice(0, 16);
}

export function parseMoscowDateTimeLocal(value: FormDataEntryValue | null) {
  const dateTime = String(value ?? "");
  if (!DATE_TIME_LOCAL_PATTERN.test(dateTime)) return new Date(Number.NaN);

  return new Date(`${dateTime}:00+03:00`);
}
