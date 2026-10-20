/** Calendar dates only: no Date parsing, timezone conversion or inferred precision. */
export function isCreatorDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function parseCreatorDate(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) return null;
  if (!isCreatorDate(value)) throw new Error("Укажите полную корректную дату.");
  return value;
}

export type CreatorLifeDates = { birthDate: string | null; deathDate: string | null };

export function planCreatorLifeDates(current: CreatorLifeDates & { typeCode: string; isPseudonym: boolean }, candidate: CreatorLifeDates) {
  const changes: { birthDate?: string; deathDate?: string } = {};
  const diagnostics: string[] = [];
  if (current.typeCode !== "person" || current.isPseudonym) {
    diagnostics.push(current.isPseudonym ? "pseudonym-skipped" : "non-person-skipped");
    return { changes, diagnostics };
  }
  if (current.birthDate === null && candidate.birthDate !== null) changes.birthDate = candidate.birthDate;
  if (current.deathDate === null && candidate.deathDate !== null) changes.deathDate = candidate.deathDate;
  const birth = current.birthDate ?? changes.birthDate;
  const death = current.deathDate ?? changes.deathDate;
  if (birth && death && birth > death) {
    delete changes.birthDate;
    delete changes.deathDate;
    diagnostics.push("life-dates-conflict");
  }
  return { changes, diagnostics };
}
