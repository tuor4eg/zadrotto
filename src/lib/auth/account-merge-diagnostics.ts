// Explicit allowlist: database errors may carry complete queries, parameters and user text.
const DRIVER_ERROR_CODES = new Set([
  "MAX_PARAMETERS_EXCEEDED", "UNDEFINED_VALUE", "ERR_INVALID_ARG_TYPE", "ERR_OUT_OF_RANGE",
  "ERR_STRING_TOO_LONG", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE",
  "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED",
]);
const ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "PostgresError"]);
export function getAccountMergeFailureDiagnostic(error: unknown) {
  const diagnostic: { errorName: string; stage?: string; sqlState?: string; constraint?: string; table?: string; driverCode?: string; causeName?: string } = {
    errorName: error instanceof Error ? error.name : "UnknownError",
  };
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current) && seen.size < 8) {
    seen.add(current);
    const row = current as Record<string, unknown>;
    if (typeof row.mergeStage === "string" && /^[a-z-]{1,100}$/.test(row.mergeStage)) diagnostic.stage = row.mergeStage;
    if (typeof row.code === "string" && /^[0-9A-Z]{5}$/.test(row.code)) diagnostic.sqlState = row.code;
    if (typeof row.code === "string" && DRIVER_ERROR_CODES.has(row.code)) diagnostic.driverCode = row.code;
    if (typeof row.name === "string" && ERROR_NAMES.has(row.name) && row.name !== diagnostic.errorName) diagnostic.causeName = row.name;
    for (const field of ["constraint", "table"] as const) {
      const value = row[field] ?? row[`${field}_name`];
      if (typeof value === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(value)) diagnostic[field] = value;
    }
    current = row.cause;
  }
  return diagnostic;
}
