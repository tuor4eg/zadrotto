import { createHash } from "node:crypto";

export function creatorImageBindingFingerprint(bindings: readonly {
  id: number; provider: string; externalCreatorId: string;
}[]) {
  const identities = bindings.map(({ id, provider, externalCreatorId }) => ({ id, provider, externalCreatorId }))
    .sort((a, b) => a.id - b.id);
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}
