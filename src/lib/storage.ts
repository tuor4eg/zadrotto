type S3StorageEnv = {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: string;
  S3_PUBLIC_BASE_URL?: string;
};

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
};

function readStorageEnv(): S3StorageEnv {
  return {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
  };
}

function normalizeOptionalEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

function parseBooleanEnvValue(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, "");
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function getS3StorageConfig(env: S3StorageEnv = readStorageEnv()): S3StorageConfig | null {
  const endpoint = normalizeOptionalEnvValue(env.S3_ENDPOINT);
  const bucket = normalizeOptionalEnvValue(env.S3_BUCKET);
  const accessKeyId = normalizeOptionalEnvValue(env.S3_ACCESS_KEY_ID);
  const secretAccessKey = normalizeOptionalEnvValue(env.S3_SECRET_ACCESS_KEY);
  const publicBaseUrl = normalizeOptionalEnvValue(env.S3_PUBLIC_BASE_URL);

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint: trimTrailingSlash(endpoint),
    region: normalizeOptionalEnvValue(env.S3_REGION) ?? "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBooleanEnvValue(env.S3_FORCE_PATH_STYLE),
    publicBaseUrl: publicBaseUrl ? trimTrailingSlash(publicBaseUrl) : null,
  };
}

export function getCoverObjectPublicUrl(
  objectKey: string,
  env: S3StorageEnv = readStorageEnv(),
) {
  const normalizedObjectKey = trimLeadingSlash(objectKey.trim());

  if (!normalizedObjectKey) {
    return null;
  }

  const config = getS3StorageConfig(env);

  if (!config) {
    return null;
  }

  const publicBaseUrl = trimTrailingSlash(
    config.publicBaseUrl ?? `${config.endpoint}/${config.bucket}`,
  );

  return `${publicBaseUrl}/${normalizedObjectKey}`;
}

export function resolveCoverUrl(coverUrl: string | null, env: S3StorageEnv = readStorageEnv()) {
  const normalizedCoverUrl = coverUrl?.trim();

  if (!normalizedCoverUrl) {
    return null;
  }

  if (isAbsoluteUrl(normalizedCoverUrl)) {
    return normalizedCoverUrl;
  }

  return getCoverObjectPublicUrl(normalizedCoverUrl, env);
}
