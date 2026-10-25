/** Historical labels remain readable after removing the executable implementation. */
const RETIRED_JOBS: Record<string, { label: string; reason: string; replacementHref: string }> = {
  "media.tmdb-person-avatar": { label: "Портреты режиссёров TMDB (старый запуск)", reason: "Старый запуск портретов снят с эксплуатации. Используйте общее заполнение изображений или обновление в карточке создателя.", replacementHref: "/admin/creators" },
  "media.creator-fantlab-avatars": { label: "Аватары FantLab (старый запуск)", reason: "Старый массовый запуск FantLab снят с эксплуатации. Используйте общее заполнение изображений или обновление в карточке создателя.", replacementHref: "/admin/creators" },
  "media.tmdb-company-logos": { label: "Логотипы компаний TMDB (старый запуск)", reason: "Старый запуск логотипов снят с эксплуатации. Используйте общее заполнение изображений или обновление в карточке создателя.", replacementHref: "/admin/creators" },
  "media.tmdb-companies-backfill": { label: "Перенос компаний TMDB (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/tools/providers/snapshots" },
  "media.tmdb-directors-backfill": { label: "Перенос режиссёров TMDB (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/tools/providers/snapshots" },
  "media.bgg-creators-backfill": { label: "Перенос создателей BGG (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/creators" },
  "media.game-companies-backfill": { label: "Перенос игровых компаний (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/creators" },
  "media.creator-fantlab-bindings": { label: "Перенос привязок FantLab (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/creators" },
  "media.creators-backfill": { label: "Старый импорт создателей книг (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/tools/providers/snapshots" },
  "media.genre-series-backfill": { label: "Перенос серий по жанрам (завершён)", reason: "Исторический перенос завершён на production и снят с эксплуатации. Используйте обычный импорт или предметную операцию.", replacementHref: "/admin/genres" },
};
export const RETIRED_JOB_TYPES = Object.keys(RETIRED_JOBS);
export function getRetiredJob(type: string) { return Object.hasOwn(RETIRED_JOBS, type) ? RETIRED_JOBS[type] : undefined; }
