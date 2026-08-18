"use client";

import Image from "next/image";
import { ImagePlus, LockKeyhole, Trash2, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/common/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function AchievementImagePicker({
  initialImageUrl,
  inputId,
  variant = "achievement",
}: {
  initialImageUrl: string | null;
  inputId: string;
  variant?: "achievement" | "locked" | "quiz";
}) {
  const pickerVariant = inputId === "quiz-image" ? "quiz" : variant;
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl);
  const [fileName, setFileName] = useState(initialImageUrl ? "Текущее изображение" : "Файл не выбран");
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  return <div className="grid gap-3">
    <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />
    <input
      ref={inputRef}
      id={inputId}
      className="sr-only"
      name="imageFile"
      type="file"
      accept={IMAGE_TYPES.join(",")}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0] ?? null;
        setError(null);

        if (file && !IMAGE_TYPES.includes(file.type)) {
          event.currentTarget.value = "";
          setError("Нужен файл JPG, PNG или WebP.");
          return;
        }
        if (file && file.size > MAX_FILE_BYTES) {
          event.currentTarget.value = "";
          setError("Изображение должно быть не больше 5 МБ.");
          return;
        }

        const nextUrl = file ? URL.createObjectURL(file) : null;
        setLocalPreviewUrl(nextUrl);
        setPreviewUrl(nextUrl ?? initialImageUrl);
        setFileName(file?.name ?? (initialImageUrl ? "Текущее изображение" : "Файл не выбран"));
        setRemoveImage(false);
      }}
    />

    <div className="flex flex-wrap items-center gap-4">
      <span className={`relative grid shrink-0 place-items-center overflow-hidden border border-stone-300 bg-stone-100 shadow-sm ${pickerVariant === "quiz" ? "h-32 w-48 rounded-md" : "size-28 rounded-full"}`}>
        {previewUrl ? <Image alt="" fill sizes="112px" className="object-cover" src={previewUrl} unoptimized /> : pickerVariant === "locked" ? <LockKeyhole className="size-10 text-stone-400" /> : <Trophy className="size-10 text-stone-400" />}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap gap-2">
          <label htmlFor={inputId} className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}>
            <ImagePlus />
            Выбрать файл
          </label>
          {previewUrl ? <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              setLocalPreviewUrl(null);
              setPreviewUrl(null);
              setFileName("Файл не выбран");
              setRemoveImage(Boolean(initialImageUrl));
              setError(null);
            }}
          >
            <Trash2 />
            Удалить изображение
          </Button> : null}
        </div>
        <p className="max-w-sm truncate text-xs text-stone-500" title={fileName}>{fileName}</p>
      </div>
    </div>
    {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    <p className="text-xs leading-5 text-stone-500">
      {pickerVariant === "quiz"
        ? "JPG, PNG или WebP до 5 МБ. Пропорции изображения сохранятся."
        : "JPG, PNG или WebP до 5 МБ. Центр будет обрезан до квадрата 512×512."}
    </p>
  </div>;
}
