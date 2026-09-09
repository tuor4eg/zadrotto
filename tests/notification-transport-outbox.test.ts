import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getNotificationTransportRetry,
  processClaimedNotificationTransportMessages,
} from "../src/lib/notifications/outbox-policy"

const claimed = (recipient: string, leaseToken = `lease-${recipient}`, attempts = 1) => ({
  attempts,
  eventId: "00000000-0000-4000-8000-000000000001",
  leaseToken,
  recipient,
  transport: "telegram",
})

describe("notification transport outbox policy", () => {
  it("retries exponentially and terminates at the maximum attempt", () => {
    const now = new Date("2026-09-08T00:00:00Z")
    assert.deepEqual(getNotificationTransportRetry(1, now), {
      status: "pending",
      nextAttemptAt: new Date("2026-09-08T00:01:00Z"),
    })
    assert.equal(getNotificationTransportRetry(10, now).status, "failed")
  })

  it("completes each recipient independently after a partial transport failure", async () => {
    const completions: Array<{ recipient: string; status: string }> = []
    const sent: string[] = []
    const result = await processClaimedNotificationTransportMessages(
      [claimed("100"), claimed("200")],
      {
        async send(message) {
          sent.push(message.recipient)
          if (message.recipient === "200") throw new Error("temporary")
        },
        async complete(input) {
          completions.push({ recipient: input.recipient, status: input.status })
          return true
        },
      },
      new Date("2026-09-08T00:00:00Z"),
    )
    assert.deepEqual(sent, ["100", "200"])
    assert.deepEqual(completions, [
      { recipient: "100", status: "delivered" },
      { recipient: "200", status: "pending" },
    ])
    assert.deepEqual(result, { delivered: 1, ownershipLost: 0, processed: 2 })
  })

  it("does not count a stale completion that lost lease ownership", async () => {
    const result = await processClaimedNotificationTransportMessages([claimed("100", "stale-token")], {
      async send() {},
      async complete() { return false },
    })
    assert.deepEqual(result, { delivered: 0, ownershipLost: 1, processed: 1 })
  })

  it("starts a claimed batch concurrently so later leases do not wait for earlier sends", async () => {
    let active = 0
    let maxActive = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const processing = processClaimedNotificationTransportMessages(
      [claimed("100"), claimed("200"), claimed("300")],
      {
        async send() {
          active += 1
          maxActive = Math.max(maxActive, active)
          await gate
          active -= 1
        },
        async complete() { return true },
      },
    )
    await Promise.resolve()
    assert.equal(maxActive, 3)
    release()
    assert.equal((await processing).delivered, 3)
  })
})
