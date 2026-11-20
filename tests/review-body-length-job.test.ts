import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mock, test } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { getDb } from "../src/db"
import { contributionReviews, jobRuns } from "../src/db/schema"
import { JobError } from "../src/lib/jobs/types"
import { parseReviewBodyLengthPayload, reviewBodyLengthHandler } from "../src/lib/reviews/body-length-job"

const context = { runId: 42, lockToken: "lease", attempt: 1, jobId: null, source: "event" as const, payload: { afterId: 0, processed: 0, updated: 0 }, signal: new AbortController().signal }

test("migration queues the registered handler without a separate CLI command", () => {
  const migration = readFileSync("drizzle/0011_review_body_format.sql", "utf8")
  assert.match(migration, /INSERT INTO job_runs/)
  assert.ok(migration.includes(`'${reviewBodyLengthHandler.type}'`))
  assert.ok(readFileSync("src/lib/jobs/handlers.ts", "utf8").includes("  reviewBodyLengthHandler,"))
  assert.deepEqual(parseReviewBodyLengthPayload({}), context.payload)
  for (const payload of [null, [], { afterId: -1 }, { updated: 1.5 }, { afterId: 2147483648 }, { force: true }]) {
    assert.throws(() => parseReviewBodyLengthPayload(payload), JobError)
  }
})

type Row = { id: number; body: string; bodyFormat: "plain" | "markdown"; length: number | null }

// Exercise the handler's checkpoint/continuation/rollback contract without touching a database.
function fixture(initialRows: Row[]) {
  process.env.DATABASE_URL ??= "postgres://unused:unused@localhost:1/unused"
  let state = { ...context.payload }
  let stored = initialRows.map((row) => ({ ...row }))
  const dialect = new PgDialect()
  const replace = mock.method(getDb(), "transaction", async (work: (tx: unknown) => Promise<unknown>) => {
    let nextState = { ...state }
    const rows = stored.map((row) => ({ ...row }))
    const tx = {
      async execute() { return [{ remaining: 120_000 }] },
      select() {
        let table: unknown
        const selection = {
          from(value: unknown) { table = value; return selection },
          where() { return selection },
          async for() { return [{ id: context.runId }] },
          orderBy() { return selection },
          async limit(size: number) {
            assert.equal(table, contributionReviews)
            assert.equal(size, 101)
            return rows.filter((row) => row.id > nextState.afterId && row.length === null).slice(0, size)
          },
          then(resolve: (result: unknown) => unknown) {
            assert.equal(table, jobRuns)
            return Promise.resolve(resolve([{ payload: nextState }]))
          },
        }
        return selection
      },
      update(table: unknown) {
        return { set(values: { bodyTextLength?: number; payload?: typeof state }) {
          return { where(condition: Parameters<PgDialect["sqlToQuery"]>[0]) {
            const update = {
              async returning() {
                assert.equal(table, contributionReviews)
                const query = dialect.sqlToQuery(condition)
                assert.match(query.sql, /"body_text_length" is null/)
                const [id, body, format] = query.params
                const row = rows.find((row) => row.id === id && row.body === body && row.bodyFormat === format && row.length === null)
                if (!row) return []
                row.length = values.bodyTextLength!
                return [{ id: row.id }]
              },
              then(resolve: (result: unknown) => unknown) {
                assert.equal(table, jobRuns)
                nextState = { ...values.payload! }
                return Promise.resolve(resolve([]))
              },
            }
            return update
          } }
        } }
      },
    }
    const result = await work(tx)
    state = nextState
    stored = rows
    return result
  })
  return { state: () => state, rows: () => stored, restore: () => replace.mock.restore() }
}

test("processes bounded batches and resumes the stored cursor rather than the initial payload", async () => {
  const data = fixture(Array.from({ length: 101 }, (_, index) => ({ id: index + 1, body: "[[title:1|Имя]]", bodyFormat: "plain", length: null })))
  try {
    await assert.rejects(reviewBodyLengthHandler.execute(context), (error: unknown) => error instanceof JobError && error.deferSeconds === 1)
    assert.deepEqual(data.state(), { afterId: 100, processed: 100, updated: 100 })
    assert.equal(data.rows().filter((row) => row.length === 3).length, 100)
    await reviewBodyLengthHandler.execute(context)
    assert.deepEqual(data.state(), { afterId: 101, processed: 101, updated: 101 })
    assert.ok(data.rows().every((row) => row.length === 3 && row.body === "[[title:1|Имя]]"))
    await reviewBodyLengthHandler.execute(context)
    assert.equal(data.state().updated, 101)
  } finally { data.restore() }
})

test("keeps already computed lengths and rolls back an aborted batch", async () => {
  const data = fixture([
    { id: 1, body: "Уже заполнено", bodyFormat: "plain", length: 13 },
    { id: 2, body: "**Текст**", bodyFormat: "markdown", length: null },
  ])
  try {
    await assert.rejects(reviewBodyLengthHandler.execute({ ...context, signal: AbortSignal.abort() }))
    assert.deepEqual(data.state(), context.payload)
    assert.equal(data.rows()[1].length, null)
    await reviewBodyLengthHandler.execute(context)
    assert.equal(data.rows()[0].length, 13)
    assert.equal(data.rows()[1].length, 5)
  } finally { data.restore() }
})
