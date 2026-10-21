/** Persist only book characteristics that do not have a working relation. */
export function compactBookFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const language = typeof facts.originalLanguage === "string" ? facts.originalLanguage.trim() : "";
  return language ? { originalLanguage: language } : {};
}
