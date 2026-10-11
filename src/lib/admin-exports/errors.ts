export function getDatabaseDumpCreationErrorCode(error: unknown): "dump-migration" | "create" {
  let current = error;
  // Drizzle wraps the original PostgreSQL error in cause. Never expose its SQL or parameters.
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    const details = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (details.code === "23514" && details.constraint_name === "admin_exports_entity_type_check") return "dump-migration";
    current = details.cause;
  }
  return "create";
}
