"use client";

import Image from "next/image";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { AchievementImagePicker } from "@/components/achievements/achievement-image-picker";
import { ImageUploadForm } from "@/components/forms/image-upload-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ACHIEVEMENT_RARITIES,
  DEFAULT_ACHIEVEMENT_RARITY,
  type AchievementRarity,
} from "@/lib/achievements/model";
import {
  createAchievementLevelAction,
  deleteAchievementLevelAction,
  updateAchievementLevelAction,
} from "./actions";

type AchievementLevelRow = {
  description: string | null;
  id: number;
  imageUrl: string | null;
  isAwarded: boolean;
  level: number;
  name: string | null;
  rarity: AchievementRarity;
  showcaseBackgroundImageUrl: string | null;
  threshold: number;
};

type LevelFormState = {
  description: string;
  id?: number;
  imageUrl: string | null;
  isAwarded: boolean;
  level: number;
  minThreshold: number;
  name: string;
  rarity: AchievementRarity;
  showcaseBackgroundImageUrl: string | null;
  threshold: number;
};

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

function LevelModal({
  achievementId,
  achievementName,
  formState,
  onClose,
}: {
  achievementId: number;
  achievementName: string;
  formState: LevelFormState;
  onClose: () => void;
}) {
  const titleId = useId();
  const isEdit = formState.id !== undefined;
  const action = isEdit ? updateAchievementLevelAction : createAchievementLevelAction;
  const inputId = `achievement-level-image-${formState.id ?? "new"}`;
  const showcaseBackgroundInputId = `achievement-level-showcase-background-${formState.id ?? "new"}`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-xl md:max-h-none md:overflow-visible"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-stone-950">
              {isEdit ? `Уровень ${formState.level}` : "Новый уровень"}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{achievementName}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
            <X />
          </Button>
        </div>

        <ImageUploadForm action={action} className="mt-5 grid gap-5">
          <input type="hidden" name="achievementId" value={achievementId} />
          {isEdit ? <input type="hidden" name="levelId" value={formState.id} /> : null}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <div className="grid content-start gap-2 md:col-span-2">
              <Label htmlFor="level-name">Название уровня</Label>
              <Input
                id="level-name"
                name="levelName"
                defaultValue={formState.name}
                placeholder="Использовать название ачивки"
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="level-threshold">Порог</Label>
              <Input
                id="level-threshold"
                name="threshold"
                type="number"
                min={formState.minThreshold}
                max={isEdit && formState.isAwarded ? formState.threshold : undefined}
                required
                defaultValue={formState.threshold}
              />
              {isEdit && formState.isAwarded ? (
                <p className="text-xs text-stone-500">Порог выданного уровня можно только понизить.</p>
              ) : null}
              {!isEdit ? (
                <p className="text-xs text-stone-500">Порог должен быть больше порога предыдущего уровня.</p>
              ) : null}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="level-rarity">Редкость</Label>
              <Select id="level-rarity" name="rarity" defaultValue={formState.rarity} required>
                {ACHIEVEMENT_RARITIES.map((rarity) => (
                  <option key={rarity} value={rarity}>{RARITY_LABELS[rarity]}</option>
                ))}
              </Select>
            </div>
            <div className="grid content-start gap-2 md:col-span-2">
              <Label htmlFor="level-description">Описание уровня</Label>
              <Textarea
                id="level-description"
                name="levelDescription"
                rows={2}
                defaultValue={formState.description}
                placeholder="Использовать описание ачивки"
              />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid h-full content-start gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-4">
              <Label htmlFor={inputId}>Изображение уровня</Label>
              <AchievementImagePicker inputId={inputId} initialImageUrl={formState.imageUrl} />
            </div>
            <div className="grid h-full content-start gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-4">
              <Label htmlFor={showcaseBackgroundInputId}>Фон витрины</Label>
              <AchievementImagePicker
                fileInputName="showcaseBackgroundImageFile"
                inputId={showcaseBackgroundInputId}
                initialImageUrl={formState.showcaseBackgroundImageUrl}
                removeInputName="removeShowcaseBackgroundImage"
                variant="showcase-background"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit">{isEdit ? "Сохранить" : "Добавить уровень"}</Button>
          </div>
        </ImageUploadForm>
      </div>
    </div>,
    document.body,
  );
}

function LevelRowActions({
  achievementId,
  canDelete,
  level,
  onEdit,
}: {
  achievementId: number
  canDelete: boolean
  level: AchievementLevelRow
  onEdit: () => void
}) {
  return (
    <div className="flex flex-nowrap justify-end gap-1.5">
      <Tooltip label="Изменить">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Изменить уровень ${level.level}`}
          onClick={onEdit}
        >
          <Edit3 />
        </Button>
      </Tooltip>
      <Tooltip label={canDelete ? "Удалить" : level.isAwarded ? "Нельзя удалить выданный уровень" : "Нельзя удалить единственный уровень"}>
        <ConfirmAction
          action={deleteAchievementLevelAction}
          fields={[
            { name: "achievementId", value: achievementId },
            { name: "levelId", value: level.id },
          ]}
          title="Удалить уровень?"
          description={`Уровень ${level.level} будет удалён. Следующие невыданные уровни перенумеруются.`}
          triggerLabel="Удалить"
          triggerAriaLabel={`Удалить уровень ${level.level}`}
          triggerIcon={<Trash2 />}
          triggerSize="icon"
          triggerVariant="outline"
          confirmLabel="Удалить"
          disabled={!canDelete}
          className="shrink-0"
        />
      </Tooltip>
    </div>
  )
}

function LevelImage({
  imageUrl,
  placeholder = "text",
}: {
  imageUrl: string | null
  placeholder?: "circle" | "text"
}) {
  if (imageUrl) {
    return (
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-stone-300 bg-stone-100">
        <Image alt="" className="object-contain" fill sizes="40px" src={imageUrl} unoptimized />
      </span>
    )
  }

  if (placeholder === "circle") {
    return <span className="size-10 shrink-0 rounded-full border border-stone-300 bg-stone-100" />
  }

  return <span className="text-xs text-stone-500">Нет</span>
}

export function AchievementLevelsTab({
  achievementId,
  achievementName,
  levels,
}: {
  achievementId: number;
  achievementName: string;
  levels: AchievementLevelRow[];
}) {
  const [modalState, setModalState] = useState<LevelFormState | null>(null);

  const openCreate = () => {
    const lastThreshold = levels.at(-1)?.threshold ?? 0;
    setModalState({
      description: "",
      imageUrl: null,
      isAwarded: false,
      level: levels.length + 1,
      minThreshold: lastThreshold + 1,
      name: "",
      rarity: DEFAULT_ACHIEVEMENT_RARITY,
      showcaseBackgroundImageUrl: null,
      threshold: lastThreshold + 1,
    });
  };

  const openEdit = (level: AchievementLevelRow) => {
    const previous = levels.find((item) => item.level === level.level - 1);
    setModalState({
      description: level.description ?? "",
      id: level.id,
      imageUrl: level.imageUrl,
      isAwarded: level.isAwarded,
      level: level.level,
      minThreshold: previous ? previous.threshold + 1 : 1,
      name: level.name ?? "",
      rarity: level.rarity,
      showcaseBackgroundImageUrl: level.showcaseBackgroundImageUrl,
      threshold: level.threshold,
    });
  };

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-stone-600">Уровни выдаются по порогу. Номер уровня назначается автоматически.</p>
      <Button type="button" variant="outline" onClick={openCreate}>
        <Plus />
        Добавить уровень
      </Button>
    </div>

    {levels.length > 0 ? (
      <>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:hidden">
          {levels.map((level) => {
            const resolvedName = level.name?.trim() || achievementName
            const canDelete = !level.isAwarded && levels.length > 1
            return (
              <div key={level.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <LevelImage imageUrl={level.imageUrl} placeholder="circle" />
                  <div className="min-w-0">
                    <div className="break-words font-medium text-stone-950">{resolvedName}</div>
                    <div className="mt-1 text-xs text-stone-500">
                      Уровень {level.level} · порог {level.threshold} · {RARITY_LABELS[level.rarity]}
                    </div>
                    {level.description ? (
                      <p className="mt-2 break-words text-sm text-stone-600">{level.description}</p>
                    ) : null}
                    {level.isAwarded ? <Badge className="mt-2" variant="outline">Выдан</Badge> : null}
                    <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
                      <span>Фон витрины:</span>
                      <LevelImage imageUrl={level.showcaseBackgroundImageUrl} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <LevelRowActions
                    achievementId={achievementId}
                    canDelete={canDelete}
                    level={level}
                    onEdit={() => openEdit(level)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <TableWrap className="mt-4 hidden overflow-hidden xl:block">
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH className="w-16">Уровень</TH>
                <TH className="w-24">Порог</TH>
                <TH className="w-28">Редкость</TH>
                <TH className="w-48">Название</TH>
                <TH>Описание</TH>
                <TH className="w-28">Значок</TH>
                <TH className="w-28">Фон</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {levels.map((level) => {
                const resolvedName = level.name?.trim() || achievementName
                const canDelete = !level.isAwarded && levels.length > 1
                return (
                  <TR key={level.id}>
                    <TD>{level.level}</TD>
                    <TD>{level.threshold}</TD>
                    <TD>{RARITY_LABELS[level.rarity]}</TD>
                    <TD className="min-w-0">
                      <div className="truncate font-medium text-stone-950">{resolvedName}</div>
                      {level.isAwarded ? <Badge className="mt-1" variant="outline">Выдан</Badge> : null}
                    </TD>
                    <TD className="min-w-0 text-stone-600">
                      <p className="truncate">{level.description ?? "—"}</p>
                    </TD>
                    <TD>
                      <LevelImage imageUrl={level.imageUrl} />
                    </TD>
                    <TD>
                      <LevelImage imageUrl={level.showcaseBackgroundImageUrl} />
                    </TD>
                    <TD className="px-2">
                      <LevelRowActions
                        achievementId={achievementId}
                        canDelete={canDelete}
                        level={level}
                        onEdit={() => openEdit(level)}
                      />
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableWrap>
      </>
    ) : (
      <p className="mt-4 text-sm text-stone-500">Уровни ещё не добавлены.</p>
    )}

    {modalState ? (
      <LevelModal
        achievementId={achievementId}
        achievementName={achievementName}
        formState={modalState}
        onClose={() => setModalState(null)}
      />
    ) : null}
  </>;
}
