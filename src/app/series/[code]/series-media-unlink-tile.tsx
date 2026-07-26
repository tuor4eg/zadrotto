"use client";

import { Unlink, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";

import { MediaItemTile } from "@/app/media-item-tile";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { Button } from "@/components/ui/button";
import { removeAuthorSeriesMediaLinkAction } from "./actions";

type Props = {
  canPublishFranchisesWithoutReview: boolean;
  franchiseCode: string;
  item: ComponentProps<typeof MediaItemTile>["item"] & { code: string };
  mediaTypes: ComponentProps<typeof MediaItemTile>["mediaTypes"];
  currentAuthorScore?: number | null;
};

export function SeriesMediaUnlinkTile({ canPublishFranchisesWithoutReview, franchiseCode, item, mediaTypes, currentAuthorScore }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unlinkedActionRevealed, setUnlinkedActionRevealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const pointerStartX = useRef<number | null>(null);
  const didSwipeToReveal = useRef(false);

  function submit() {
    startTransition(async () => {
      const result = await removeAuthorSeriesMediaLinkAction({ franchiseCode, mediaItemCode: item.code });
      if (!result.success) {
        setMessage("Не удалось изменить связь. Попробуйте ещё раз.");
        return;
      }
      setConfirming(false);
      setMessage(result.removalStatus === "requested" ? "Запрос на удаление отправлен на проверку." : "Связь с серией удалена.");
      router.refresh();
    });
  }

  return (
    <div
      className="group relative min-w-0"
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerStartX.current = event.clientX;
        didSwipeToReveal.current = false;
      }}
      onPointerUp={(event) => {
        if (pointerStartX.current !== null && event.clientX - pointerStartX.current < -40) {
          didSwipeToReveal.current = true;
          setUnlinkedActionRevealed(true);
        }
        pointerStartX.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointerStartX.current = null;
        didSwipeToReveal.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onClickCapture={(event) => {
        if (!didSwipeToReveal.current) return;
        event.preventDefault();
        event.stopPropagation();
        didSwipeToReveal.current = false;
      }}
    >
      <MediaItemTile currentAuthorScore={currentAuthorScore} item={item} href={`/media/${item.code}`} mediaTypes={mediaTypes} />
      <ArchiveTooltip label="Удалить из серии" side="right" className="absolute left-2 top-2 z-30">
        <button
          type="button"
          className={`grid size-7 place-items-center rounded-full border border-red-200 bg-red-50/95 text-red-700 shadow-sm transition-all hover:border-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100 ${unlinkedActionRevealed ? "max-md:opacity-100" : "max-md:pointer-events-none max-md:opacity-0 max-md:focus-visible:pointer-events-auto max-md:focus-visible:opacity-100"}`}
          aria-label={`Удалить запись ${item.title} из серии`}
          onClick={() => { setMessage(null); setConfirming(true); setUnlinkedActionRevealed(false); }}
        >
          <Unlink className="size-3.5" />
        </button>
      </ArchiveTooltip>
      {message ? <p className="absolute inset-x-1 bottom-1 z-30 rounded bg-stone-950/85 px-1.5 py-1 text-center text-[10px] leading-tight text-stone-50" role="status">{message}</p> : null}
      {confirming ? createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-stone-950/55 p-4" role="presentation">
          <div className="archive-paper archive-panel w-full max-w-md p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="series-unlink-title">
            <div className="flex items-start justify-between gap-3"><h2 id="series-unlink-title" className="font-serif text-3xl leading-none text-stone-950">Убрать запись из серии?</h2><Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => setConfirming(false)} aria-label="Закрыть"><X /></Button></div>
            <p className="mt-3 text-sm leading-6 text-stone-700">{canPublishFranchisesWithoutReview ? "Связь записи с серией будет удалена сразу." : "Будет создана заявка на удаление связи записи с серией."}</p>
            <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Отмена</Button><Button type="button" variant="destructive" disabled={pending} onClick={submit}>{pending ? "Сохраняем…" : "Убрать"}</Button></div>
          </div>
        </div>, document.body,
      ) : null}
    </div>
  );
}
