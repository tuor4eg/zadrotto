export type ConservativeDescriptionLanguage = "empty" | "english" | "russian" | "unknown";

const CYRILLIC_LETTER_PATTERN = /\p{Script=Cyrillic}/gu;
const LATIN_LETTER_PATTERN = /\p{Script=Latin}/gu;

export function hasCyrillicText(value: string) {
  return /\p{Script=Cyrillic}/u.test(value);
}

export function classifyDescriptionLanguage(value: string | null | undefined): ConservativeDescriptionLanguage {
  const text = value?.trim() ?? "";
  if (!text) return "empty";

  const cyrillicCount = text.match(CYRILLIC_LETTER_PATTERN)?.length ?? 0;
  const latinCount = text.match(LATIN_LETTER_PATTERN)?.length ?? 0;
  const recognizedCount = cyrillicCount + latinCount;

  if (cyrillicCount >= 10 && recognizedCount > 0 && cyrillicCount / recognizedCount >= 0.6) {
    return "russian";
  }

  if (latinCount >= 20 && cyrillicCount === 0) {
    return "english";
  }

  return "unknown";
}
