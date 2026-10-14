"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MediaItemRatingModal } from "@/app/media-item-rating-dialog";
import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { TitlePartCard } from "@/components/archive/title-part-card";
import { TitlePartDescriptionDialog } from "@/components/archive/title-part-description-dialog";
import type { TitlePartView } from "@/db/queries/title-parts";
import type { MediaType } from "@/lib/media/types";
import { getTitlePartLabel, getTitlePartsHeading, isTitlePartRateable } from "@/lib/media/title-parts";
import { getDemoPartRating, deleteDemoPartRating } from "@/lib/user-state/demo-actions";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

export function TitlePartsSection({ parts, mediaItemCode, mediaType, title, currentAuthor }: {
  parts: TitlePartView[];
  mediaItemCode: string;
  mediaType: MediaType;
  title: string;
  currentAuthor: { name: string; code: string } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const router = useRouter();
  const profile = useDemoProfile();
  const isDemo = !currentAuthor && profile?.import.importedAt == null && Boolean(profile);
  const [columns, setColumns] = useState(3);
  const [expanded, setExpanded] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [descriptionPartId, setDescriptionPartId] = useState<number | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const mobile = window.matchMedia("(max-width: 639px)");
    const updateColumns = () => {
      setColumns(mobile.matches ? 3 : Math.max(1, Math.floor((element.getBoundingClientRect().width + 12) / 152)));
    };
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    mobile.addEventListener("change", updateColumns);
    updateColumns();
    return () => {
      observer.disconnect();
      mobile.removeEventListener("change", updateColumns);
    };
  }, []);
  useEffect(() => {
    if (!isDemo) return;
    for (const part of parts) {
      if (!isTitlePartRateable(part) && getDemoPartRating(mediaItemCode, part.id, profile)) {
        deleteDemoPartRating(mediaItemCode, part.id);
      }
    }
  }, [isDemo, mediaItemCode, parts, profile]);
  const visibleParts = parts.filter((part) => part.type !== "season" || part.number !== 0);
  const selected = visibleParts.find((part) => part.id === selectedPartId && isTitlePartRateable(part));
  const describedPart = visibleParts.find((part) => part.id === descriptionPartId);
  function myRating(part: TitlePartView) {
    return currentAuthor ? part.myRating : isDemo ? getDemoPartRating(mediaItemCode, part.id, profile)?.score ?? null : null;
  }
  if (visibleParts.length === 0) return null;
  return <section aria-labelledby={`${id}-heading`} className="w-full min-w-0">
    <div className="flex items-center justify-between gap-3">
      <h2 id={`${id}-heading`} className="min-w-0 font-mono text-lg uppercase tracking-wider">{getTitlePartsHeading(visibleParts)}</h2>
      {visibleParts.length > columns ? (
        <button type="button" aria-expanded={expanded} aria-controls={`${id}-parts`}
          className="shrink-0 text-sm underline underline-offset-4" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Свернуть" : `Показать все ${visibleParts.length} →`}
        </button>
      ) : null}
    </div>
    <div ref={container} id={`${id}-parts`} className="mt-4 grid gap-2.5 sm:gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {(expanded ? visibleParts : visibleParts.slice(0, columns)).map((part) => <TitlePartCard key={part.id} part={part} mediaType={mediaType} myRating={myRating(part)}
        onDescribe={() => setDescriptionPartId(part.id)}
        onRate={() => {
          if (!isTitlePartRateable(part)) return;
          setSelectedPartId(part.id);
          if (!currentAuthor && !isDemo) setLoginOpen(true);
        }} />)}
    </div>
    {describedPart?.description?.trim() ? <TitlePartDescriptionDialog
      title={`${title} — ${getTitlePartLabel(describedPart)}`}
      description={describedPart.description} onClose={() => setDescriptionPartId(null)} /> : null}
    {selected && (currentAuthor || isDemo) && !loginOpen ? createPortal(<MediaItemRatingModal
      key={selected.id} partId={selected.id} mediaItemCode={mediaItemCode} title={`${title} — ${getTitlePartLabel(selected)}`}
      currentAuthor={currentAuthor} currentAuthorScore={myRating(selected)} formId={`${id}-rating`}
      onClose={() => { setSelectedPartId(null); router.refresh(); }} />, document.body) : null}
    {loginOpen ? createPortal(<AuthorLoginModal onClose={() => { setLoginOpen(false); setSelectedPartId(null); }}
      onSuccess={() => { setLoginOpen(false); router.refresh(); }} />, document.body) : null}
  </section>;
}
