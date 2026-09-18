import { AchievementAwardHistory } from "@/components/achievements/achievement-award-history"
import { AuthorAchievementGallery } from "@/components/achievements/author-achievement-gallery"
import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"

export function AuthorAchievementsCatalog({
  items,
}: {
  items: AchievementShowcaseItem[]
}) {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)]">
      <AuthorAchievementGallery items={items} />
      <div className="min-h-0 lg:h-0 lg:min-h-full">
        <AchievementAwardHistory items={items} />
      </div>
    </div>
  )
}
