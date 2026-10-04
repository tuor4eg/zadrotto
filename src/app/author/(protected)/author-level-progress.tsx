import type { AuthorLevelProgress as AuthorLevelProgressData } from "@/db/queries/reputation";

export function AuthorLevelProgress({ progress }: { progress: AuthorLevelProgressData }) {
  const hasNextLevel = progress.nextLevel !== null && progress.nextLevelXp !== null;
  const range = hasNextLevel ? progress.nextLevelXp! - progress.currentLevelXp : 1;
  const completed = hasNextLevel ? progress.xpTotal - progress.currentLevelXp : 1;
  const percent = Math.min(100, Math.max(0, (completed / Math.max(1, range)) * 100));
  const progressLabel = hasNextLevel
    ? `${progress.xpTotal} / ${progress.nextLevelXp} XP до уровня ${progress.nextLevel}`
    : `${progress.xpTotal} XP · максимальный уровень`;

  return (
    <div className="mt-2 w-full max-w-md" aria-label="Прогресс уровня автора">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-stone-600">
        <span>Уровень {progress.currentLevel} · {progress.currentLevelName}</span>
        <span className="text-right tabular-nums">{progressLabel}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-300/80"
        role="progressbar"
        aria-label={hasNextLevel ? `Прогресс до уровня ${progress.nextLevel}` : "Достигнут максимальный уровень"}
        aria-valuemin={progress.currentLevelXp}
        aria-valuemax={hasNextLevel ? progress.nextLevelXp! : progress.xpTotal}
        aria-valuenow={hasNextLevel ? Math.min(progress.xpTotal, progress.nextLevelXp!) : progress.xpTotal}
      >
        <div className="h-full rounded-full bg-amber-700" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-stone-600">
        <span>Статус: <strong className="font-semibold text-stone-800">{progress.accessProfileName}</strong></span>
      </div>
    </div>
  );
}
