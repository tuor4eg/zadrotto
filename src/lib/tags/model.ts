import { normalizeSearchText } from "@/lib/search/normalize";

export type VisibleMediaItemTag = {
  id: number;
  code: string;
  title: string;
  isPublic: boolean;
  isMine: boolean;
  isEditorial?: boolean;
};

export function parseTagTitle(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid-tag");
  const title = value.trim().replace(/\s+/g, " ");
  if (!normalizeSearchText(title) || title.length > 80) throw new Error("invalid-tag");
  return title;
}

export type AdminTagStatus = "all" | "system" | "ordinary";
export function parseAdminTagStatus(value: unknown): AdminTagStatus {
  return value === "system" || value === "ordinary" ? value : "all";
}
