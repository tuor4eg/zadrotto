import { classifyDescriptionLanguage } from "@/lib/media/anime-shikimori-language";

const SHIKIMORI_LINK_TAG = /\[(?:(?:character|person|anime|manga)=[0-9]+|\/(?:character|person|anime|manga))\]/;

export function containsShikimoriMarkup(description: string | null | undefined) {
  return SHIKIMORI_LINK_TAG.test(description ?? "");
}

export function sanitizeShikimoriDescription(description: string) {
  return description.replace(new RegExp(SHIKIMORI_LINK_TAG.source, "g"), "").trim();
}

export function needsShikimoriDescriptionRefresh(description: string | null | undefined) {
  const language = classifyDescriptionLanguage(description);
  return language === "empty" || language === "english" || containsShikimoriMarkup(description);
}
