export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_MAX_INPUT_PIXELS = 40_000_000;
export const AVATAR_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarImageType = (typeof AVATAR_IMAGE_TYPES)[number];
