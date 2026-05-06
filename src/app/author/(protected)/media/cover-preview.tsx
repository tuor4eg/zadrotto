"use client";

import { useState } from "react";

type CoverPreviewProps = {
  src: string;
  alt: string;
  thumbnailClassName: string;
  buttonClassName?: string;
};

export function CoverPreview({
  src,
  alt,
  thumbnailClassName,
  buttonClassName = "block w-fit border border-zinc-200 bg-white p-1 text-left transition-colors hover:border-zinc-950",
}: CoverPreviewProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPreviewOpen(true)}
        className={buttonClassName}
        aria-label="Открыть обложку в полном размере"
        title="Открыть обложку"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={thumbnailClassName} />
      </button>

      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр обложки"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="flex max-h-full max-w-full flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="self-end border border-white/40 bg-black px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white hover:text-zinc-950"
            >
              Закрыть просмотр
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[82vh] max-w-[92vw] object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
