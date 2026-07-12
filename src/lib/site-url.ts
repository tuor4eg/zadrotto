export function getSiteOrigin(value = process.env.SITE_URL) {
  if (!value) {
    throw new Error("SITE_URL is required.");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("SITE_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SITE_URL must use http or https.");
  }

  return new URL(url.origin);
}
