export const ARCHIVE_EXPLORATION_RATING_LIMIT = 5;
export const ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE = 80;
export const ARCHIVE_EXPLORATION_ONBOARDING_STEPS = {
  invitation: 10,
  interests: 20,
  guide: 30,
  ratings: 40,
  completed: 100,
} as const;

export type ArchiveExplorationOnboardingStep =
  (typeof ARCHIVE_EXPLORATION_ONBOARDING_STEPS)[keyof typeof ARCHIVE_EXPLORATION_ONBOARDING_STEPS];

export type ArchiveExplorationCandidate = {
  averageScore: number;
  code: string;
  coverThumbUrl: string | null;
  coverUrl: string | null;
  id: number;
  mediaType: string;
  mediaTypeName: string;
  ratingsCount: number;
  releaseYear: number | null;
  title: string;
};

export type ArchiveExplorationMediaTypeOption = {
  code: string;
  description: string | null;
  id: number;
  isEnabled: boolean;
  name: string;
};

export type ArchiveExplorationResult =
  | { status: "onboarding" }
  | { status: "interests" }
  | { status: "ready" }
  | { status: "candidate"; candidate: ArchiveExplorationCandidate; ratingsCount: number }
  | { status: "graduated"; ratingsCount: number }
  | { status: "complete"; ratingsCount: number }
  | { status: "error"; message: string };
