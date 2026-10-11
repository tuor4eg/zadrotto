import { XMLParser } from "fast-xml-parser";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function matchesPolicyPattern(pattern: unknown, value: string) {
  if (typeof pattern !== "string") return false;
  const regex = pattern.split("*").map((part) => part.split("?").map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".")).join(".*");
  return new RegExp(`^${regex}$`).test(value);
}

/** Reject potentially public allows even with conditions; do not try to implement all IAM precedence rules. */
export function policyAllowsPublicRead(policy: unknown, resource: string): boolean {
  if (!policy || typeof policy !== "object" || !("Statement" in policy)) return true;
  const statements = asArray((policy as Record<string, unknown>).Statement);
  return statements.some((value) => {
    if (!value || typeof value !== "object") return true;
    const statement = value as Record<string, unknown>;
    if (statement.Effect !== "Allow") return false;
    const principal = statement.Principal;
    const publicPrincipal = principal === "*" || statement.NotPrincipal !== undefined
      || (principal !== null && typeof principal === "object"
        && asArray((principal as Record<string, unknown>).AWS).some((value) => value === "*"));
    if (!publicPrincipal) return false;
    const allowsRead = statement.NotAction !== undefined
      || asArray(statement.Action).some((action) => matchesPolicyPattern(action, "s3:GetObject"));
    const coversObject = statement.NotResource !== undefined
      || asArray(statement.Resource).some((pattern) => matchesPolicyPattern(pattern, resource));
    return allowsRead && coversObject;
  });
}

export function aclAllowsPublicRead(xml: string): boolean {
  const parsed = new XMLParser({ removeNSPrefix: true }).parse(xml);
  const grants = parsed?.AccessControlPolicy?.AccessControlList?.Grant;
  if (!parsed?.AccessControlPolicy || grants === undefined) return true;
  return asArray(grants).some((value) => {
    if (!value || typeof value !== "object") return true;
    const grant = value as { Grantee?: { URI?: string }; Permission?: string };
    return ["READ", "FULL_CONTROL"].includes(grant.Permission ?? "")
      && /\/(AllUsers|AuthenticatedUsers)$/.test(grant.Grantee?.URI ?? "");
  });
}
