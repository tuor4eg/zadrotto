export function RobloxDetailsFacts({ facts }: { facts?: Record<string, unknown> | null }) {
  const entries = [
    typeof facts?.maxPlayers === "number" && facts.maxPlayers > 0 ? `До ${facts.maxPlayers} игроков на сервере` : null,
    facts?.paidAccess === true ? "Платный доступ" : null,
    typeof facts?.privateServers === "boolean" ? `Приватные серверы: ${facts.privateServers ? "да" : "нет"}` : null,
  ].filter((value): value is string => Boolean(value));
  return <>{entries.map(entry => <span key={entry}><span className="mx-1.5" aria-hidden="true">•</span>{entry}</span>)}</>;
}
