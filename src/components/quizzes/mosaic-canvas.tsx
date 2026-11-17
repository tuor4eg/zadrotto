"use client";

import { useEffect, useRef, useState } from "react";
import { LifeLossToast } from "./life-loss-toast";
import { createMosaicLayout, getMosaicCrop, isMosaicCellOpen, MOSAIC_COLUMNS, MOSAIC_ROWS } from "@/lib/quizzes/mosaic";

export function MosaicCanvas({ imageUrl, seed, openedMask, disabled = false, readOnly = false, onOpen, onReady }: {
  imageUrl: string | null;
  seed: number;
  openedMask: number;
  disabled?: boolean;
  readOnly?: boolean;
  onOpen?: (index: number) => void;
  onReady?: (ready: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lastOpened, setLastOpened] = useState<number | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (lastOpened === null || !isMosaicCellOpen(openedMask, lastOpened)) return;
    const timer = window.setTimeout(() => setLastOpened(null), 1_000);
    return () => window.clearTimeout(timer);
  }, [lastOpened, openedMask]);

  useEffect(() => {
    let active = true;
    onReady?.(false);
    if (!imageUrl) return;
    const source = new Image();
    source.onload = () => { if (active) { setImage(source); setFailed(false); onReady?.(true); } };
    source.onerror = () => { if (active) { setFailed(true); onReady?.(false); } };
    source.src = imageUrl;
    return () => { active = false; };
  }, [imageUrl, reload, onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !imageUrl || image.src !== new URL(imageUrl, window.location.href).href) return;
    const layout = createMosaicLayout(seed);
    const crop = getMosaicCrop(image.naturalWidth, image.naturalHeight);
    function draw() {
      if (!canvas || !image) return;
      const width = Math.max(1, canvas.getBoundingClientRect().width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * 1.5 * dpr);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(canvas.width / 4, canvas.height / 6);
      context.fillStyle = "#e7e5e4";
      context.fillRect(0, 0, 4, 6);
      const tile = crop.width / MOSAIC_COLUMNS;
      for (let position = 0; position < layout.length; position++) {
        if (!isMosaicCellOpen(openedMask, position)) continue;
        const { sourceIndex, rotation } = layout[position];
        context.save();
        context.translate(position % 4 + 0.5, Math.floor(position / 4) + 0.5);
        context.rotate(rotation * Math.PI / 180);
        context.drawImage(image, crop.x + sourceIndex % 4 * tile, crop.y + Math.floor(sourceIndex / 4) * tile, tile, tile, -0.5, -0.5, 1, 1);
        context.restore();
      }
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [image, imageUrl, seed, openedMask]);

  return <div className="mx-auto grid w-full max-w-[320px] gap-2">
    <div className="relative aspect-[2/3] w-full rounded-md border border-stone-400 bg-stone-200" role={readOnly ? "img" : undefined} aria-label={readOnly ? "Мозаика: текущий прогресс" : undefined}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full rounded-md" />
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-6 overflow-hidden rounded-[inherit]" role={readOnly ? undefined : "group"} aria-label={readOnly ? undefined : "Мозаика: 24 фрагмента"} aria-hidden={readOnly || undefined}>
        {Array.from({ length: MOSAIC_COLUMNS * MOSAIC_ROWS }, (_, index) => {
          const open = isMosaicCellOpen(openedMask, index);
          if (readOnly) return <span key={index} className={`border border-stone-500/30 ${open ? "bg-transparent" : "bg-stone-200"}`} />;
          return <div key={index} className="relative min-h-0 min-w-0">
          <button type="button" aria-label={`Фрагмент ${index + 1}: ${open ? "открыт" : "открыть за 1 жизнь"}`}
            disabled={disabled || !image || failed || open}
            onClick={() => { setLastOpened(index); onOpen?.(index); }}
            className={`absolute inset-0 h-full w-full touch-manipulation border border-stone-500/30 text-sm text-stone-600 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-amber-700 ${open ? "bg-transparent" : "bg-stone-200 enabled:hover:bg-stone-300"}`}>
            {open ? null : index + 1}
          </button>
          </div>;
        })}
      </div>
      {!readOnly && lastOpened !== null && isMosaicCellOpen(openedMask, lastOpened)
        ? <LifeLossToast key={lastOpened} style={{ left: `${(lastOpened % MOSAIC_COLUMNS + 0.5) * 100 / MOSAIC_COLUMNS}%`, top: `calc(${Math.floor(lastOpened / MOSAIC_COLUMNS) * 100 / MOSAIC_ROWS}% - 8px)` }} /> : null}
    </div>
    {failed ? <div role="alert" className="text-sm text-red-800">Не удалось загрузить постер. {readOnly ? null : <button type="button" className="underline" onClick={() => { setImage(null); setFailed(false); setReload((value) => value + 1); }}>Повторить</button>}</div>
      : !image && imageUrl && !readOnly ? <p role="status" className="text-sm text-stone-600">Загружаем постер…</p> : null}
  </div>;
}
