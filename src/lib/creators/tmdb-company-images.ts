export function getTmdbCompanyLogoUrl(path: unknown) {
  return typeof path === "string" && /^\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(path)
    ? `https://image.tmdb.org/t/p/original${path}` : null;
}
