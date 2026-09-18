import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("migration and schema define singleton achievement settings", () => {
  const schema = read("src/db/schema.ts")
  const migration = read("drizzle/0071_achievement_settings.sql")
  const defaultShowcaseMigration = read(
    "drizzle/0089_achievement_settings_default_showcase_background.sql",
  )
  const journal = read("drizzle/meta/_journal.json")

  assert.match(schema, /achievementSettings = pgTable\([\s\S]*"achievement_settings"/)
  assert.match(schema, /lockedImageObjectKey: text\("locked_image_object_key"\)/)
  assert.match(
    schema,
    /defaultShowcaseBackgroundImageObjectKey: text\("default_showcase_background_image_object_key"\)/,
  )
  assert.match(schema, /achievement_settings_singleton_id_check/)
  assert.match(
    schema,
    /achievement_settings_default_showcase_background_image_object_key_check/,
  )
  assert.match(migration, /CHECK \("achievement_settings"\."id" = 1\)/)
  assert.match(migration, /ON DELETE set null/)
  assert.match(migration, /VALUES \(1, NULL\)/)
  assert.match(journal, /0071_achievement_settings/)
  assert.match(journal, /0089_achievement_settings_default_showcase_background/)
  assert.match(
    defaultShowcaseMigration,
    /default_showcase_background_image_object_key/,
  )
})

test("stores locked and default showcase images under dedicated object keys", () => {
  const images = read("src/lib/achievements/images.ts")
  const featuredShowcase = read("src/lib/achievements/featured-showcase.ts")
  assert.match(images, /achievements\/locked\/\$\{randomUUID\(\)\}\.webp/)
  assert.match(images, /LOCKED_ACHIEVEMENT_IMAGE_OBJECT_KEY/)
  assert.match(images, /uploadLockedAchievementImage/)
  assert.match(images, /achievements\/default-showcase-background\/\$\{randomUUID\(\)\}\.webp/)
  assert.match(images, /DEFAULT_SHOWCASE_BACKGROUND_OBJECT_KEY/)
  assert.match(images, /uploadDefaultShowcaseBackgroundImage/)
  assert.match(featuredShowcase, /DEFAULT_ACHIEVEMENT_SHOWCASE_BACKGROUND_URL/)
  assert.match(featuredShowcase, /resolveFeaturedShowcaseBackgroundUrl/)
  assert.doesNotMatch(images, /resolveFeaturedShowcaseBackgroundUrl/)
})

test("serves the locked placeholder only when it is assigned in settings", () => {
  const query = read("src/db/queries/achievements.ts")
  const settingsQuery = read("src/db/queries/achievement-settings.ts")
  assert.match(query, /achievementSettings\.lockedImageObjectKey/)
  assert.match(query, /imageUrl: awarded \? ownImageUrl : settings\.lockedImageUrl/)
  assert.match(settingsQuery, /onConflictDoUpdate/)
  assert.match(settingsQuery, /isAchievementImageObjectKey\(input\.lockedImageObjectKey\)/)
  assert.match(
    settingsQuery,
    /isAchievementImageObjectKey\(input\.defaultShowcaseBackgroundImageObjectKey\)/,
  )
  assert.match(settingsQuery, /defaultShowcaseBackgroundImageUrl/)
})

test("admin settings expose locked and default showcase background options", () => {
  const action = read("src/app/admin/(protected)/settings/achievements/actions.ts")
  const page = read("src/app/admin/(protected)/settings/achievements/page.tsx")
  const navigation = read("src/app/admin/(protected)/settings/settings-nav.tsx")
  const activity = read("src/lib/activity-logs/model.ts")

  assert.match(navigation, /\/admin\/settings\/achievements/)
  assert.match(navigation, /label: "Ачивки"/)
  assert.match(page, /Изображение для неполученной ачивки/)
  assert.match(page, /variant="locked"/)
  assert.match(page, /показывается иконка замка/)
  assert.match(page, /Стандартный фон витрины/)
  assert.match(page, /variant="showcase-background"/)
  assert.match(page, /fileInputName="defaultShowcaseBackgroundImageFile"/)
  assert.match(page, /ImageUploadForm/)
  assert.doesNotMatch(read("src/components/achievements/achievement-card.tsx"), /grayscale/)
  assert.match(action, /requireAdminUser\(\)/)
  assert.match(action, /uploadLockedAchievementImage/)
  assert.match(action, /uploadDefaultShowcaseBackgroundImage/)
  assert.match(action, /updateAchievementSettings/)
  assert.match(action, /deleteAchievementImageBestEffort\(uploadedObjectKey\)|uploadedObjectKeys\.map/)
  assert.match(action, /achievement-settings\.updated/)
  assert.match(activity, /"achievement-settings"/)
  assert.match(activity, /"achievement-settings.updated"/)
})
