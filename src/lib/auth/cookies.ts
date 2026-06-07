export function shouldUseSecureCookies() {
  const override = process.env.SECURE_COOKIES?.trim().toLowerCase();

  if (override === "true") {
    return true;
  }

  if (override === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}
