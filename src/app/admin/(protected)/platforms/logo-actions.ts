"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePlatformId } from "@/lib/media/admin-platforms";
import { AVATAR_MAX_BYTES } from "@/lib/avatars/config";
import { uploadPlatformLogoBuffer, deletePlatformLogoBestEffort } from "@/lib/platforms/logo-storage";
import { getPlatformLogoState, setManualPlatformLogo, clearManualPlatformLogo, setPlatformLogoMode } from "@/db/queries/platform-logos";
import { createJobRun } from "@/db/queries/jobs";
import { DEFAULT_JOB_MAX_ATTEMPTS, DEFAULT_JOB_RETRY_BASE_SECONDS, DEFAULT_JOB_RETRY_MAX_SECONDS, DEFAULT_JOB_TIMEOUT_SECONDS } from "@/lib/jobs/model";

function parse(formData: FormData) {
  const platformId = parsePlatformId(formData.get("platformId"));
  const rawVersion = formData.get("logoVersion");
  const expectedVersion = typeof rawVersion === "string" && /^\d+$/.test(rawVersion) ? Number(rawVersion) : -1;
  if (!platformId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Некорректная платформа.");
  return { platformId, expectedVersion };
}
function finish(platformId: number, error = false): never {
  revalidatePath("/platforms");
  revalidatePath("/admin/platforms");
  revalidatePath(`/admin/platforms/${platformId}/edit`);
  revalidatePath("/admin/platform-requests");
  redirect(`/admin/platforms/${platformId}/edit?${error ? "logoError=1" : "logoUpdated=1"}`);
}

export async function uploadPlatformLogoAction(formData: FormData) {
  await requireAdminUser();
  const input = parse(formData);
  let staged: string | null = null;
  try {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0 || file.size > AVATAR_MAX_BYTES) throw new Error("Нужен файл до 5 МБ.");
    const stored = await uploadPlatformLogoBuffer({ platformId: input.platformId, buffer: Buffer.from(await file.arrayBuffer()) });
    staged = stored.objectKey;
    const previous = await setManualPlatformLogo({ ...input, ...stored });
    staged = null;
    await deletePlatformLogoBestEffort(previous);
  } catch { await deletePlatformLogoBestEffort(staged); finish(input.platformId, true); }
  finish(input.platformId);
}

export async function clearPlatformLogoAction(formData: FormData) {
  await requireAdminUser();
  const input = parse(formData);
  try {
    const previous = await getPlatformLogoState(input.platformId);
    await clearManualPlatformLogo(input);
    await deletePlatformLogoBestEffort(previous?.manualLogoObjectKey ?? null);
  } catch { finish(input.platformId, true); }
  finish(input.platformId);
}

export async function changePlatformLogoModeAction(formData: FormData) {
  await requireAdminUser();
  const input = parse(formData);
  try {
    const mode = formData.get("logoMode");
    if (mode !== "exact" && mode !== "combined") throw new Error("Некорректный режим.");
    await setPlatformLogoMode({ ...input, mode });
  } catch { finish(input.platformId, true); }
  finish(input.platformId);
}

export async function syncPlatformLogoAction(formData: FormData) {
  const admin = await requireAdminUser();
  const { platformId } = parse(formData);
  try {
    if (!await getPlatformLogoState(platformId)) throw new Error("Платформа не найдена.");
    await createJobRun({ type: "media.platform-logos-sync", payload: { platformId, force: true }, source: "manual", createdByAdminId: admin.id,
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS, retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS, timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS });
  } catch { finish(platformId, true); }
  finish(platformId);
}
