"use client";

import { Plus, X } from "lucide-react";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";

type MediaTitleAliasAddButtonProps = {
  aliases: string[];
  limit: number;
  onChange: (aliases: string[]) => void;
  archiveTooltipSide?: "bottom" | "left" | "right" | "top";
  tooltipVariant?: "admin" | "archive";
};

export function MediaTitleAliasAddButton({
  aliases,
  limit,
  onChange,
  archiveTooltipSide = "bottom",
  tooltipVariant = "archive",
}: MediaTitleAliasAddButtonProps) {
  if (aliases.length >= limit) {
    return null;
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Добавить название"
      onClick={() => onChange([...aliases, ""])}
    >
      <Plus className="size-4" aria-hidden="true" />
    </Button>
  );

  return tooltipVariant === "archive" ? (
    <ArchiveTooltip label="Добавить название" side={archiveTooltipSide}>
      {button}
    </ArchiveTooltip>
  ) : (
    <Tooltip label="Добавить название">{button}</Tooltip>
  );
}

type MediaTitleAliasFieldsProps = MediaTitleAliasAddButtonProps & {
  idPrefix: string;
};

export function MediaTitleAliasFields({
  aliases,
  idPrefix,
  limit,
  onChange,
  archiveTooltipSide = "bottom",
  tooltipVariant = "archive",
}: MediaTitleAliasFieldsProps) {
  if (aliases.length === 0) {
    return null;
  }

  const exceedsLimit = aliases.length > limit;
  const comparableAliases = aliases.map((alias) => alias.trim().toLowerCase());
  const duplicateAliasIndexes = new Set(
    comparableAliases.flatMap((alias, index) =>
      alias &&
      comparableAliases.some(
        (otherAlias, otherIndex) => otherIndex !== index && otherAlias === alias,
      )
        ? [index]
        : [],
    ),
  );
  const hasDuplicateAliases = duplicateAliasIndexes.size > 0;

  return (
    <div className="flex flex-col gap-2">
      {aliases.map((alias, index) => {
        const id = `${idPrefix}-${index}`;
        const isLast = index === aliases.length - 1;
        const isDuplicate = duplicateAliasIndexes.has(index);

        return (
          <div key={id} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label className="sr-only" htmlFor={id}>
                Альтернативное название {index + 1}
              </Label>
              <Input
                id={id}
                name="titleAliases"
                type="text"
                value={alias}
                placeholder="Другое название"
                pattern={isDuplicate ? "a^" : undefined}
                title={isDuplicate ? "Альтернативные названия не должны повторяться." : undefined}
                aria-invalid={isDuplicate}
                className={isDuplicate ? "border-red-400 focus:border-red-500" : undefined}
                onChange={(event) => {
                  const nextAliases = [...aliases];
                  nextAliases[index] = event.currentTarget.value;
                  onChange(nextAliases);
                }}
              />
            </div>
            {tooltipVariant === "archive" ? (
              <ArchiveTooltip label="Удалить название" side={archiveTooltipSide}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Удалить альтернативное название ${index + 1}`}
                  onClick={() => onChange(aliases.filter((_, aliasIndex) => aliasIndex !== index))}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </ArchiveTooltip>
            ) : (
              <Tooltip label="Удалить название">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Удалить альтернативное название ${index + 1}`}
                  onClick={() => onChange(aliases.filter((_, aliasIndex) => aliasIndex !== index))}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </Tooltip>
            )}
            {isLast ? (
              <MediaTitleAliasAddButton
                aliases={aliases}
                limit={limit}
                onChange={onChange}
                archiveTooltipSide={archiveTooltipSide}
                tooltipVariant={tooltipVariant}
              />
            ) : null}
          </div>
        );
      })}
      {hasDuplicateAliases ? (
        <p className="text-sm text-red-700" role="alert">
          Альтернативные названия не должны повторяться.
        </p>
      ) : null}
      {exceedsLimit ? (
        <p className="text-sm text-amber-700" role="alert">
          Сейчас разрешено не больше {limit}. Удалите лишние названия, чтобы сохранить запись.
        </p>
      ) : null}
    </div>
  );
}
