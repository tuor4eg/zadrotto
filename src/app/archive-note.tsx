type ArchiveNoteProps = {
  text?: string | null;
  maxWidthClassName?: string;
};

export function ArchiveNote({ text, maxWidthClassName = "max-w-[620px]" }: ArchiveNoteProps) {
  const visibleText = text?.trim() || "Здесь пока пусто...";

  return (
    <div className={`archive-notebook-note mx-auto w-full ${maxWidthClassName}`}>
      <div className="archive-notebook-tape" aria-hidden="true" />
      <div className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        Архивная заметка
      </div>
      <p className="archive-typewriter-text text-[15px] leading-8 text-stone-900">{visibleText}</p>
    </div>
  );
}
