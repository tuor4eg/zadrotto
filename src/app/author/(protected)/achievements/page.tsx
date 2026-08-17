import { AchievementShowcase } from "@/components/achievements/achievement-showcase";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { requireAuthor } from "@/lib/auth/author-auth";

export default async function AuthorAchievementsPage() {
  const author = await requireAuthor()
  const items = await getAchievementShowcase(author.id)

  return <AchievementShowcase items={items} title="Ачивки" emptyText="Ачивки пока не добавлены." />
}
