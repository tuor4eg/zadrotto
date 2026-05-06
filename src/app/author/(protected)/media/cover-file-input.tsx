"use client";

import { useEffect, useRef, useState } from "react";

import { CoverPreview } from "./cover-preview";

const EMPTY_FILE_LABEL = "Файл не выбран";
const CURRENT_FILE_LABEL = "Текущая обложка";

type CoverFileInputProps = {
  initialPreviewUrl?: string | null;
};

export function CoverFileInput({ initialPreviewUrl }: CoverFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(
    initialPreviewUrl ? CURRENT_FILE_LABEL : EMPTY_FILE_LABEL,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl ?? null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isCoverRemoved, setIsCoverRemoved] = useState(false);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="coverAction" value={isCoverRemoved ? "remove" : "keep"} />
        <input
          ref={inputRef}
          id="author-media-cover-file"
          name="coverFile"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            const nextPreviewUrl = file ? URL.createObjectURL(file) : null;

            setIsCoverRemoved(false);
            setFileName(file?.name ?? (initialPreviewUrl ? CURRENT_FILE_LABEL : EMPTY_FILE_LABEL));
            setLocalPreviewUrl(nextPreviewUrl);
            setPreviewUrl(nextPreviewUrl ?? initialPreviewUrl ?? null);
          }}
        />
        <label
          htmlFor="author-media-cover-file"
          className="cursor-pointer border border-zinc-950 bg-zinc-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white hover:text-zinc-950"
        >
          Выбрать файл
        </label>
        {previewUrl ? (
          <button
            type="button"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.value = "";
              }

              setIsCoverRemoved(true);
              setFileName(EMPTY_FILE_LABEL);
              setLocalPreviewUrl(null);
              setPreviewUrl(null);
            }}
            className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:border-red-700 hover:text-red-700"
          >
            Удалить обложку
          </button>
        ) : null}
        <span className="min-w-0 truncate text-sm text-zinc-500">{fileName}</span>
      </div>

      {previewUrl ? (
        <CoverPreview
          src={previewUrl}
          alt="Обложка"
          buttonClassName="mt-3 block w-fit border border-zinc-200 bg-white p-1 text-left transition-colors hover:border-zinc-950"
          thumbnailClassName="h-28 w-20 object-cover"
        />
      ) : null}
    </>
  );
}
