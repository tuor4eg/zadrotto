export function formatRelativeArchiveDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const millisecondsPerDay = 86_400_000
  const differenceInDays = Math.round((date.getTime() - Date.now()) / millisecondsPerDay)

  if (differenceInDays >= -1 && differenceInDays <= 0) {
    return new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" }).format(differenceInDays, "day")
  }

  if (differenceInDays > -30 && differenceInDays < -1) {
    return new Intl.RelativeTimeFormat("ru-RU", { numeric: "always" }).format(differenceInDays, "day")
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(date)
}
