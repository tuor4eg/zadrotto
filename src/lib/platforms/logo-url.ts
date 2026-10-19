export function isPlatformLogoObjectKey(key: string | null): key is string {
  return Boolean(key && /^logos\/platforms\/[1-9]\d*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(key));
}

export function isPlatformProviderLogoObjectKey(key: string | null): key is string {
  return Boolean(key && /^avatars\/platform-providers\/(igdb|rawg)\/[1-9]\d*\/[a-f0-9]{64}\.webp$/.test(key));
}

export function getPlatformLogoUrl(key: string | null) {
  if (key && isPlatformProviderLogoObjectKey(key)) return `/platform-logos/providers/${key.slice("avatars/platform-providers/".length)}`;
  return key && /^logos\/platforms\/[1-9]\d*\/[0-9a-f-]+\.webp$/.test(key) && isPlatformLogoObjectKey(key) ? `/platform-logos/${String(key).slice("logos/platforms/".length)}` : null;
}

export function resolvePlatformLogoUrl(input: { logoMode: string; manualLogoObjectKey: string | null; importedLogoObjectKey: string | null }) {
  return getPlatformLogoUrl(input.manualLogoObjectKey) ?? getPlatformLogoUrl(input.importedLogoObjectKey);
}
