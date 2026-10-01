export const CSV_BOM = "\uFEFF";
export function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function createCsvRow(values: readonly unknown[]) {
  return `${values.map(escapeCsvCell).join(",")}\r\n`;
}
