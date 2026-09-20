const GOOGLE_ANALYTICS_ID_PATTERN = /^G-[A-Z0-9]+$/i;

export function getGoogleAnalyticsId(value = process.env.GOOGLE_ANALYTICS_ID) {
  const measurementId = value?.trim();

  return measurementId && GOOGLE_ANALYTICS_ID_PATTERN.test(measurementId)
    ? measurementId
    : null;
}
