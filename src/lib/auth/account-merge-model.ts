export type AccountMergePreview = {
  grantId: string;
  version: string;
  primaryAuthorId: number;
  accounts: { id: number; name: string; login: string | null; avatarObjectKey: string | null; ratings: number; reviews: number }[];
  counts: { label: string; transferred: number; conflicts: number }[];
  disabledMethods: string[];
};
