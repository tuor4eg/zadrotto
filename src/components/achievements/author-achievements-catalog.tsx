import { AchievementHistoryLayout } from "@/components/achievements/achievement-history-layout"
import { AuthorAchievementGallery } from "@/components/achievements/author-achievement-gallery"
import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"

export function AuthorAchievementsCatalog({
  items,
}: {
  items: AchievementShowcaseItem[]
}) {
  return (
    <AchievementHistoryLayout items={items}>
      <AuthorAchievementGallery items={items} />
    </AchievementHistoryLayout>
  )
}
