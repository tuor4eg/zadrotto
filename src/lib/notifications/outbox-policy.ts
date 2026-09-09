export const NOTIFICATION_TRANSPORT_MAX_ATTEMPTS = 10
const RETRY_BASE_SECONDS = 60
const RETRY_MAX_SECONDS = 60 * 60

export type ClaimedNotificationDelivery = {
  attempts: number
  eventId: string
  leaseToken: string | null
  recipient: string
  transport: string
}

export function getNotificationTransportRetry(attempts: number, now: Date) {
  const delaySeconds = Math.min(RETRY_BASE_SECONDS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_SECONDS)
  return {
    status: attempts >= NOTIFICATION_TRANSPORT_MAX_ATTEMPTS ? "failed" as const : "pending" as const,
    nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000),
  }
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : "Неизвестная ошибка доставки.")
    .replace(/bot\d+:[^/\s]+/gi, "bot[redacted]").slice(0, 500)
}

export async function processClaimedNotificationTransportMessages<T extends ClaimedNotificationDelivery>(
  messages: T[],
  operations: {
    complete: (input: {
      eventId: string
      transport: string
      recipient: string
      leaseToken: string
      status: "pending" | "delivered" | "failed"
      nextAttemptAt?: Date
      deliveredAt?: Date | null
      lastError?: string | null
    }) => Promise<boolean>
    send: (message: T) => Promise<void>
  },
  now = new Date(),
) {
  const outcomes = await Promise.all(messages.map(async (message) => {
    if (!message.leaseToken) return { delivered: 0, ownershipLost: 0 }
    try {
      await operations.send(message)
      const completed = await operations.complete({
        eventId: message.eventId, transport: message.transport, recipient: message.recipient,
        leaseToken: message.leaseToken, status: "delivered", deliveredAt: now, lastError: null,
      })
      return completed ? { delivered: 1, ownershipLost: 0 } : { delivered: 0, ownershipLost: 1 }
    } catch (error) {
      const retry = getNotificationTransportRetry(message.attempts, now)
      const completed = await operations.complete({
        eventId: message.eventId, transport: message.transport, recipient: message.recipient,
        leaseToken: message.leaseToken, ...retry, lastError: sanitizeError(error),
      })
      return completed ? { delivered: 0, ownershipLost: 0 } : { delivered: 0, ownershipLost: 1 }
    }
  }))
  return {
    delivered: outcomes.reduce((sum, outcome) => sum + outcome.delivered, 0),
    ownershipLost: outcomes.reduce((sum, outcome) => sum + outcome.ownershipLost, 0),
    processed: messages.length,
  }
}
