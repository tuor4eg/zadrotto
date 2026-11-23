"use server";

import { revalidatePath } from "next/cache";

import { saveEntrySources, updateWorksBasedOn } from "@/db/queries/entry-sources";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parseEntrySourceId, parseEntrySources } from "@/lib/media/entry-sources";

export type EntrySourcesActionState = { message: string; error?: boolean; savedWorks?: number[] };

function revalidateEntrySources() {
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/archive");
}

export async function saveEntrySourcesAction(
  entryId: number,
  _previous: EntrySourcesActionState,
  formData: FormData,
) {
  await requireAdminUser();
  const sources = parseEntrySources(formData.getAll("source"), entryId);
  if (!parseEntrySourceId(String(entryId)) || !sources) {
    return { message: "Проверьте список первоисточников.", error: true };
  }

  try {
    if (!(await saveEntrySources(entryId, sources))) {
      return { message: "Запись больше не существует.", error: true };
    }
  } catch (error) {
    if (error instanceof Error && (error.cause as { code?: string } | undefined)?.code === "23503") {
      return { message: "Один из первоисточников был удалён. Обновите список.", error: true };
    }
    console.error("Ошибка сохранения первоисточников", error);
    return { message: "Не удалось сохранить первоисточники. Повторите попытку.", error: true };
  }

  revalidateEntrySources();
  return { message: "Первоисточники сохранены." };
}

export async function saveWorksBasedOnAction(
  entryId: number,
  previous: EntrySourcesActionState,
  formData: FormData,
): Promise<EntrySourcesActionState> {
  await requireAdminUser();
  const works = parseEntrySources(formData.getAll("source"), entryId);
  const baseline = previous.savedWorks;
  if (!parseEntrySourceId(String(entryId)) || !works || works.some(({ type }) => type !== "entry") ||
      !Array.isArray(baseline) || baseline.some((id) => typeof id !== "number" || !parseEntrySourceId(String(id)) || id === entryId)) {
    return { ...previous, message: "Проверьте список записей.", error: true };
  }

  const savedWorks = works.map(({ id }) => id);
  const desiredIds = new Set(savedWorks);
  const baselineIds = new Set(baseline);
  const addedIds = savedWorks.filter((id) => !baselineIds.has(id));
  const removedIds = [...baselineIds].filter((id) => !desiredIds.has(id));
  try {
    if (!(await updateWorksBasedOn(entryId, addedIds, removedIds))) {
      return { ...previous, message: "Одна из записей больше не существует. Обновите список.", error: true };
    }
  } catch (error) {
    console.error("Ошибка сохранения списка записей на основе первоисточника", error);
    return { ...previous, message: "Не удалось сохранить список записей. Повторите попытку.", error: true };
  }

  revalidateEntrySources();
  return { message: "Список записей сохранён.", savedWorks };
}
