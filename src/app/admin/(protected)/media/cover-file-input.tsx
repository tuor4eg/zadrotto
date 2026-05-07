"use client";

import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CoverPreview } from "@/app/author/(protected)/media/cover-preview";

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
          id="admin-media-cover-file"
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
          htmlFor="admin-media-cover-file"
          className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}
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
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Удалить обложку
          </button>
        ) : null}
        <span className="min-w-0 truncate text-sm text-stone-500">{fileName}</span>
      </div>

      {previewUrl ? (
        <CoverPreview
          src={previewUrl}
          alt="Обложка"
          buttonClassName="mt-3 block w-fit rounded-md border border-stone-200 bg-white p-1 text-left transition-colors hover:border-stone-400"
          thumbnailClassName="h-28 w-20 rounded object-cover"
        />
      ) : null}
    </>
  );
}
