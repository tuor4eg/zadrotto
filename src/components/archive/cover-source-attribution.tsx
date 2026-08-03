const COVER_SOURCE_LABELS: Record<string, string> = {
  "comic-vine": "Comic Vine",
  rawg: "RAWG",
};

type CoverSourceAttributionProps = {
  provider?: string | null;
  pageUrl?: string | null;
};

export function CoverSourceAttribution({
  provider,
  pageUrl,
}: CoverSourceAttributionProps) {
  const providerLabel = provider ? COVER_SOURCE_LABELS[provider] : null;

  if (!providerLabel || !pageUrl) {
    return null;
  }

  return (
    <a
      href={pageUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex w-fit text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-950"
    >
      Обложка: {providerLabel}
    </a>
  );
}
