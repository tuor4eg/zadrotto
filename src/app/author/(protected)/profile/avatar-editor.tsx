"use client";

import Cropper, { type Area } from "react-easy-crop";
import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/form";

import { removeAuthorAvatarAction, updateAuthorAvatarAction } from "./actions";

export function AvatarEditor({
  authorName,
  avatarObjectKey,
}: {
  authorName: string;
  avatarObjectKey: string | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusElementRef = useRef<HTMLInputElement | null>(null);

  const closeCrop = useCallback(() => {
    setImageUrl(null);
    setCroppedArea(null);
    const input = restoreFocusElementRef.current;
    if (input) {
      input.value = "";
      window.requestAnimationFrame(() => input.focus());
    }
  }, []);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (!imageUrl) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCrop();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogTitleRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogTitleRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      restoreFocusElementRef.current?.focus();
    };
  }, [closeCrop, imageUrl]);

  return (
    <section className="rounded-md border p-4">
      <form action={updateAuthorAvatarAction}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={authorName} objectKey={avatarObjectKey} className="size-16 text-xl" />
            <div>
              <h3 className="font-semibold">Аватар</h3>
              <p className="text-sm text-stone-600">JPEG, PNG или WebP до 5 МБ.</p>
            </div>
          </div>
          <label
            htmlFor="avatarFile"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {avatarObjectKey ? "Заменить" : "Выбрать файл"}
          </label>
          <input
            id="avatarFile"
            name="avatarFile"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            required
            onChange={(event) => {
              restoreFocusElementRef.current = event.currentTarget;
              const file = event.target.files?.[0];
              setImageUrl((current) => {
                if (current) URL.revokeObjectURL(current);
                return file ? URL.createObjectURL(file) : null;
              });
              setCrop({ x: 0, y: 0 });
              setZoom(1);
              setCroppedArea(null);
            }}
          />
        </div>

        {imageUrl ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/70 p-4">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Отменить кадрирование"
              onClick={closeCrop}
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="avatar-crop-title"
              aria-describedby="avatar-crop-description"
              className="relative w-full max-w-2xl rounded-md bg-white p-5 shadow-2xl"
            >
              <h3
                ref={dialogTitleRef}
                id="avatar-crop-title"
                className="font-serif text-2xl outline-none"
                tabIndex={-1}
              >
                Кадрирование аватара
              </h3>
              <p id="avatar-crop-description" className="mt-1 text-sm text-stone-600">
                Перемести изображение и настрой масштаб, затем сохрани выбранную область.
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_128px]">
                <div className="relative h-72 overflow-hidden rounded-md bg-stone-950">
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_area: Area, pixels: Area) => setCroppedArea(pixels)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm text-stone-600">Предпросмотр</p>
                  <div className="relative size-32 overflow-hidden rounded-full bg-stone-950 pointer-events-none">
                    <Cropper
                      image={imageUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      cropShape="round"
                      showGrid={false}
                      onCropChange={() => undefined}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="avatarZoom">Масштаб</Label>
                <input
                  id="avatarZoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCrop}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={!croppedArea}>Сохранить</Button>
              </div>
            </div>
          </div>
        ) : null}

        <input type="hidden" name="cropX" value={croppedArea?.x ?? ""} />
        <input type="hidden" name="cropY" value={croppedArea?.y ?? ""} />
        <input type="hidden" name="cropWidth" value={croppedArea?.width ?? ""} />
        <input type="hidden" name="cropHeight" value={croppedArea?.height ?? ""} />
      </form>

      {avatarObjectKey ? (
        <form action={removeAuthorAvatarAction} className="mt-3">
          <Button type="submit" variant="outline">Удалить аватар</Button>
        </form>
      ) : null}
    </section>
  );
}
