import { randomUUID } from "node:crypto";

const DEFAULT_SLUG = "item";

const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterateCyrillic(value: string) {
  return value.replace(/[а-яё]/gi, (letter) => {
    const normalizedLetter = letter.toLowerCase();

    return CYRILLIC_TRANSLITERATION[normalizedLetter] ?? "";
  });
}

export function slugifyCodePart(value: string) {
  const slug = transliterateCyrillic(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || DEFAULT_SLUG;
}

export function generateEntityCode(input: {
  name: string;
  type: string;
  uniqueId?: string;
}) {
  const type = slugifyCodePart(input.type);
  const name = slugifyCodePart(input.name);
  const uniqueId = input.uniqueId ?? randomUUID().replace(/-/g, "").slice(0, 10);

  return `${type}-${name}-${uniqueId}`;
}
