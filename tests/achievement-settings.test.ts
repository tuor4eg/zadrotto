import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("migration and schema define singleton achievement settings", () => {
  const schema = read("src/db/schema.ts")
  const migration = read("drizzle/0071_achievement_settings.sql")
  const journal = read("drizzle/meta/_journal.json")

  assert.match(schema, /achievementSettings = pgTable\([\s\S]*"achievement_settings"/)
  assert.match(schema, /lockedImageObjectKey: text\("locked_image_object_key"\)/)
  assert.match(schema, /achievement_settings_singleton_id_check/)
  assert.match(migration, /CHECK \("achievement_settings"\."id" = 1\)/)
  assert.match(migration, /ON DELETE set null/)
  assert.match(migration, /VALUES \(1, NULL\)/)
  assert.match(journal, /0071_achievement_settings/)
})

test("stores locked achievement images under a dedicated object key", () => {
  const images = read("src/lib/achievements/images.ts")
  assert.match(images, /achievements\/locked\/\$\{randomUUID\(\)\}\.webp/)
  assert.match(images, /LOCKED_ACHIEVEMENT_IMAGE_OBJECT_KEY/)
  assert.match(images, /uploadLockedAchievementImage/)
})

test("serves the locked placeholder only when it is assigned in settings", () => {
  const query = read("src/db/queries/achievements.ts")
  const settingsQuery = read("src/db/queries/achievement-settings.ts")
  assert.match(query, /achievementSettings\.lockedImageObjectKey/)
  assert.match(query, /imageUrl: awarded \? ownImageUrl : settings\.lockedImageUrl/)
  assert.match(settingsQuery, /onConflictDoUpdate/)
  assert.match(settingsQuery, /isAchievementImageObjectKey\(input\.lockedImageObjectKey\)/)
})

test("admin settings expose the locked image option and persist it safely", () => {
  const action = read("src/app/admin/(protected)/settings/achievements/actions.ts")
  const page = read("src/app/admin/(protected)/settings/achievements/page.tsx")
  const navigation = read("src/app/admin/(protected)/settings/settings-nav.tsx")
  const activity = read("src/lib/activity-logs/model.ts")

  assert.match(navigation, /\/admin\/settings\/achievements/)
  assert.match(navigation, /label: "Ачивки"/)
  assert.match(page, /Изображение для неполученной ачивки/)
  assert.match(page, /variant="locked"/)
  assert.match(page, /показывается иконка замка/)
  assert.match(page, /ImageUploadForm/)
  assert.doesNotMatch(read("src/components/achievements/achievement-card.tsx"), /grayscale/)
  assert.match(action, /requireAdminUser\(\)/)
  assert.match(action, /uploadLockedAchievementImage/)
  assert.match(action, /updateAchievementLockedImage/)
  assert.match(action, /deleteAchievementImageBestEffort\(uploadedObjectKey\)/)
  assert.match(action, /achievement-settings\.updated/)
  assert.match(activity, /"achievement-settings"/)
  assert.match(activity, /"achievement-settings.updated"/)
})
