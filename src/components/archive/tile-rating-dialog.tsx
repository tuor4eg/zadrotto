"use client";

import { useEffect, useState } from "react";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { getRatingDialogData } from "@/app/ratings/dialog-data";

export default function TileRatingDialog({ code, partId }: { code: string; partId?: number | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getRatingDialogData>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getRatingDialogData(code, partId).then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [code, partId]);

  if (failed) return <p role="alert" className="text-sm text-stone-600">Не удалось загрузить оценку. Нажмите на неё ещё раз.</p>;
  if (!data) return <p role="status" className="text-sm text-stone-600">Загрузка оценки…</p>;
  return <div hidden><MediaItemRatingDialog {...data} openRequestKey={1} /></div>;
}
