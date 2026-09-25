import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import sharp from "sharp"

import {
  buildAchievementShowcaseBackgroundObjectKey,
  isAchievementImageObjectKey,
  processAchievementShowcaseBackgroundFile,
} from "../src/lib/achievements/images"
import {
  ACHIEVEMENT_RARITIES,
  DEFAULT_ACHIEVEMENT_RARITY,
  isAchievementRarity,
} from "../src/lib/achievements/model"
import { buildDemoAchievementShowcaseItems } from "../src/lib/user-state/demo-achievements"

const read = (path: string) => readFileSync(path, "utf8")

describe("achievement level rarity and showcase background", () => {
  it("defines one strict rarity model and a database default/constraint", () => {
    assert.deepEqual(ACHIEVEMENT_RARITIES, ["common", "rare", "epic", "legendary"])
    assert.equal(DEFAULT_ACHIEVEMENT_RARITY, "common")
    assert.equal(isAchievementRarity("legendary"), true)
    assert.equal(isAchievementRarity("unknown"), false)
    assert.equal(isAchievementRarity(null), false)

    const migration = read("drizzle/0088_achievement_level_rarity_showcase_background.sql")
    const journal = read("drizzle/meta/_journal.json")
    assert.match(migration, /"rarity" text DEFAULT 'common' NOT NULL/)
    assert.match(migration, /"showcase_background_image_object_key" text/)
    assert.match(migration, /CHECK \("rarity" IN \('common', 'rare', 'epic', 'legendary'\)\)/)
    assert.match(journal, /0088_achievement_level_rarity_showcase_background/)
  })

  it("normalizes showcase backgrounds to a central 2:3 WebP and rejects invalid files", async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 30, g: 100, b: 190 },
      },
    }).png().toBuffer()
    const processed = await processAchievementShowcaseBackgroundFile(
      new File([new Uint8Array(source)], "background.png", { type: "image/png" }),
    )
    assert.equal(processed.ok, true)
    if (processed.ok) {
      const metadata = await sharp(processed.body).metadata()
      assert.equal(metadata.width, 1200)
      assert.equal(metadata.height, 1800)
      assert.equal(metadata.format, "webp")
    }

    assert.deepEqual(
      await processAchievementShowcaseBackgroundFile(
        new File([], "empty.png", { type: "image/png" }),
      ),
      { ok: false, error: "image-too-large" },
    )
    assert.deepEqual(
      await processAchievementShowcaseBackgroundFile(
        new File(["not-an-image"], "background.gif", { type: "image/gif" }),
      ),
      { ok: false, error: "image-invalid" },
    )
    const oversized = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "large.webp",
      { type: "image/webp" },
    )
    assert.deepEqual(
      await processAchievementShowcaseBackgroundFile(oversized),
      { ok: false, error: "image-too-large" },
    )
  })

  it("uses a scoped safe key and only serves backgrounds assigned to a level", () => {
    const key = buildAchievementShowcaseBackgroundObjectKey(42)
    assert.match(key, /^achievements\/42\/showcase-background\/.+\.webp$/)
    assert.equal(isAchievementImageObjectKey(key), true)
    assert.equal(
      isAchievementImageObjectKey("achievements/42/showcase-background/../../secret.webp"),
      false,
    )

    const query = read("src/db/queries/achievements.ts")
    assert.match(query, /eq\(achievementLevels\.showcaseBackgroundImageObjectKey, objectKey\)/)
    assert.match(query, /showcaseBackgroundImageObjectKey: achievementLevels\.showcaseBackgroundImageObjectKey/)
    assert.match(query, /imageObjectKeys: levels\.flatMap/)
  })

  it("validates and edits two independent images in the admin level form", () => {
    const actions = read("src/app/admin/(protected)/achievements/actions.ts")
    const editPage = read("src/app/admin/(protected)/achievements/[id]/edit/page.tsx")
    const levels = read("src/app/admin/(protected)/achievements/achievement-levels-tab.tsx")
    assert.match(actions, /isAchievementRarity\(rarity\)/)
    assert.match(actions, /showcaseBackgroundImageFile/)
    assert.match(actions, /removeShowcaseBackgroundImage/)
    assert.match(actions, /Promise\.all\(\[/)
    assert.match(actions, /deleteUploadedLevelImages/)
    assert.match(
      actions,
      /if \(imageResult\.error \|\| showcaseBackgroundResult\.error\) \{[\s\S]*deleteUploadedLevelImages\([\s\S]*imageResult\.uploadedObjectKey,[\s\S]*showcaseBackgroundResult\.uploadedObjectKey,[\s\S]*redirect/,
    )
    assert.match(levels, /name="rarity"/)
    assert.match(levels, /DEFAULT_ACHIEVEMENT_RARITY/)
    assert.match(levels, /fileInputName="showcaseBackgroundImageFile"/)
    assert.match(levels, /variant="showcase-background"/)
    assert.match(levels, /max-w-5xl[^"]*md:max-h-none md:overflow-visible/)
    assert.match(levels, /grid gap-5 md:grid-cols-2/)
    assert.match(levels, /grid items-start gap-4 md:grid-cols-2/)
    assert.match(levels, /md:col-span-2">\s*<Label htmlFor="level-name"/)
    assert.match(levels, /rounded-lg border border-stone-200 bg-stone-50\/70 p-4/)
    assert.match(levels, /mt-4 grid gap-3 md:grid-cols-2 xl:hidden/)
    assert.match(levels, /TableWrap className="mt-4 hidden overflow-hidden xl:block"/)
    assert.match(editPage, /tab === "levels" \? "max-w-7xl" : "max-w-3xl"/)
  })

  it("keeps level presentation fields in public and demo projections", () => {
    const query = read("src/db/queries/achievements.ts")
    assert.match(query, /rarity: presentation\.rarity/)
    assert.match(query, /showcaseBackgroundImageUrl: resolveAchievementImageUrl\(presentation\.showcaseBackgroundImageObjectKey\)/)
    assert.match(query, /rarity: item\.rarity/)

    const [locked, awarded] = buildDemoAchievementShowcaseItems([{
      code: "ratings",
      description: null,
      mechanic: "rating.authored.count",
      name: "Оценки",
      params: {},
      levels: [
        {
          description: "Первая",
          imageUrl: null,
          level: 1,
          name: "Обычная",
          rarity: "common",
          showcaseBackgroundImageUrl: "/common.webp",
          threshold: 1,
        },
        {
          description: "Вторая",
          imageUrl: null,
          level: 2,
          name: "Редкая",
          rarity: "rare",
          showcaseBackgroundImageUrl: "/rare.webp",
          threshold: 2,
        },
      ],
    }], { ratings: 0 }, "2026-01-01T00:00:00.000Z").concat(
      buildDemoAchievementShowcaseItems([{
        code: "ratings",
        description: null,
        mechanic: "rating.authored.count",
        name: "Оценки",
        params: {},
        levels: [
          {
            description: "Первая",
            imageUrl: null,
            level: 1,
            name: "Обычная",
            rarity: "common",
            showcaseBackgroundImageUrl: "/common.webp",
            threshold: 1,
          },
          {
            description: "Вторая",
            imageUrl: null,
            level: 2,
            name: "Редкая",
            rarity: "rare",
            showcaseBackgroundImageUrl: "/rare.webp",
            threshold: 2,
          },
        ],
      }], { ratings: 2 }, "2026-01-01T00:00:00.000Z"),
    )

    assert.equal(locked?.rarity, "common")
    assert.equal(locked?.showcaseBackgroundImageUrl, "/common.webp")
    assert.equal(awarded?.rarity, "rare")
    assert.equal(awarded?.showcaseBackgroundImageUrl, "/rare.webp")
    assert.deepEqual(awarded?.awardedLevels.map((level) => level.rarity), ["common", "rare"])

    const [awardedWithoutBackground] = buildDemoAchievementShowcaseItems([{
      code: "ratings",
      description: null,
      mechanic: "rating.authored.count",
      name: "Оценки",
      params: {},
      levels: [
        {
          description: null,
          imageUrl: null,
          level: 1,
          name: "Обычная",
          rarity: "common",
          showcaseBackgroundImageUrl: "/common.webp",
          threshold: 1,
        },
        {
          description: null,
          imageUrl: null,
          level: 2,
          name: "Редкая",
          rarity: "rare",
          showcaseBackgroundImageUrl: null,
          threshold: 2,
        },
      ],
    }], { ratings: 2 }, "2026-01-01T00:00:00.000Z")
    assert.equal(awardedWithoutBackground?.showcaseBackgroundImageUrl, null)
  })

  it("requires admin authorization to delete an achievement level", () => {
    const actions = read("src/app/admin/(protected)/achievements/actions.ts")
    assert.match(
      actions,
      /export async function deleteAchievementLevelAction\(formData: FormData\) \{\s*await requireAdminUser\(\)/,
    )
  })
})
