export function resolveCreatorAvatarUrl(key: string | null) {
  return key && /^avatars\/creators\/[1-9]\d*\/[0-9a-f-]+\.webp$/.test(key)
    ? `/creator-avatars/${key.slice("avatars/creators/".length)}` : null;
}
