export type PlatformLogoCandidate = {
  key: string;
  provider: string;
  externalId: string;
  name: string;
  imageKey: string;
  objectKey: string;
  contentHash: string;
};
export type PlatformAssetProposal = {
  platformId: number;
  expectedVersion: number;
  candidates: PlatformLogoCandidate[];
  selectedCandidateKey?: string;
  provider?: string;
  externalId?: string;
  imageKey?: string;
  objectKey?: string;
  contentHash?: string;
  reason: string;
};
export type PlatformAssetCounters = {
  created: number; approved: number; applying: number;
  pending: number; applied: number; skipped: number;
};
export const platformRequestKindLabel = (kind: string) =>
  kind === "logo" ? "Логотип" : "Сопоставление платформы";
