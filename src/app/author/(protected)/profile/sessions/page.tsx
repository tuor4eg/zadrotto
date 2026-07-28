import { ActivityLogTime } from "@/app/admin/(protected)/tools/activity/activity-log-time";
import { Button } from "@/components/ui/button";
import { getAuthorSessions } from "@/db/queries/author-auth";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";

import { revokeAuthorSessionAction } from "../actions";

export default async function AuthorSessionsPage() {
  const current = await getCurrentAuthorSession();
  if (!current) return null;

  const sessions = await getAuthorSessions(current.author.id);

  return (
    <section>
      <h2 className="font-serif text-3xl">Сессии</h2>
      <p className="mt-1 text-sm text-stone-600">
        Активные входы в аккаунт автора.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <form action={revokeAuthorSessionAction}>
          <input type="hidden" name="intent" value="others" />
          <Button type="submit" variant="outline">
            Завершить остальные сессии
          </Button>
        </form>
        <form action={revokeAuthorSessionAction}>
          <input type="hidden" name="intent" value="all" />
          <Button type="submit" variant="destructive">
            Выйти везде
          </Button>
        </form>
      </div>

      <div className="mt-5 grid gap-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="archive-paper-surface flex flex-wrap items-center justify-between gap-4 rounded-md border p-4"
          >
            <div>
              <p className="font-medium">
                {session.id === current.session.sessionId ? "Текущая сессия" : "Сессия"}
              </p>
              <p className="text-xs text-stone-500">
                {session.authMethod} ·{" "}
                <ActivityLogTime value={session.lastSeenAt.toISOString()} />
              </p>
            </div>
            <form action={revokeAuthorSessionAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <Button type="submit" size="sm" variant="outline">
                Завершить
              </Button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
