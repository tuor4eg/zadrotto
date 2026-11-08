import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

test("showcase calculates progress only for incomplete chains and skips evaluation when every chain is complete", {
  skip: !process.env.ACHIEVEMENT_BUDGET_TEST_DATABASE_URL,
}, async () => {
  const url = process.env.ACHIEVEMENT_BUDGET_TEST_DATABASE_URL!
  const name = `achievement_budget_${randomUUID().replaceAll("-", "")}`
  const admin = postgres(url, { max: 1, onnotice: () => {} })
  const databaseUrl = new URL(url)
  databaseUrl.pathname = `/${name}`
  let fixture: ReturnType<typeof postgres> | undefined
  let closeApp: (() => Promise<void>) | undefined
  let restoreMechanic: (() => void) | undefined
  const oldUrl = process.env.DATABASE_URL
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`)
    fixture = postgres(databaseUrl.toString(), { max: 1, onnotice: () => {} })
    await migrate(drizzle(fixture), { migrationsFolder: "drizzle" })
    await fixture`update achievements set enabled=false,show_when_locked=false`
    await fixture`insert into authors(id,code,name,access_profile_id) values(10001,'budget-author','Автор',2)`
    const definitions = await fixture`insert into achievements(code,name,mechanic,params,enabled,show_when_locked)
      values('budget-complete','Завершена','rating.authored.count','{}',true,true),
      ('budget-progress','В процессе','rating.authored.count','{}',true,true),
      ('budget-locked','Не открыта','rating.authored.count','{}',true,true) returning id,code`
    const complete = definitions.find(row => row.code === "budget-complete")!.id
    const progress = definitions.find(row => row.code === "budget-progress")!.id
    const locked = definitions.find(row => row.code === "budget-locked")!.id
    for (const row of definitions) {
      await fixture`insert into achievement_levels(achievement_id,level,threshold,rarity) values(${row.id},1,1,'common'),(${row.id},2,2,'common')`
    }
    await fixture`insert into user_achievements(author_id,achievement_level_id,award_group_id)
      select 10001,id,gen_random_uuid() from achievement_levels where achievement_id=${complete} or (achievement_id=${progress} and level=1)`
    process.env.DATABASE_URL = databaseUrl.toString()
    const { getDbClient } = await import("../src/db")
    const { getAchievementShowcase } = await import("../src/db/queries/achievements")
    const { getAchievementMechanic } = await import("../src/lib/achievements/catalog")
    closeApp = () => getDbClient().end()
    const mechanic = getAchievementMechanic("rating.authored.count")!
    const evaluate = mechanic.evaluateBatch
    const evaluated: number[] = []
    mechanic.evaluateBatch = async input => {
      evaluated.push(...input.instances.map(instance => instance.achievementId))
      return evaluate(input)
    }
    restoreMechanic = () => { mechanic.evaluateBatch = evaluate }
    const items = await getAchievementShowcase(10001)
    assert.deepEqual(evaluated.sort((a, b) => a - b), [progress, locked].sort((a, b) => a - b))
    assert.equal(items.find(item => item.code === "budget-complete")?.awardedLevels.length, 2)
    assert.equal(items.find(item => item.code === "budget-complete")?.nextLevel, null)
    assert.equal(items.find(item => item.code === "budget-progress")?.nextLevel, 2)
    await fixture`insert into user_achievements(author_id,achievement_level_id,award_group_id)
      select 10001,id,gen_random_uuid() from achievement_levels where achievement_id in (${progress},${locked}) on conflict do nothing`
    evaluated.length = 0
    const allComplete = await getAchievementShowcase(10001)
    assert.equal(evaluated.length, 0)
    assert.equal(allComplete.length, 3)
    assert.ok(allComplete.every(item => item.nextLevel === null && item.awardedLevels.length === 2))
  } finally {
    restoreMechanic?.()
    await closeApp?.()
    await fixture?.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`)
    await admin.end()
    if (oldUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = oldUrl
  }
})
