import { createHash, createHmac } from "node:crypto";

import {
  buildMissingServiceConfigHealthCheck,
  buildServiceHealthCheck,
  getErrorMessage,
  type ServiceHealthCheck,
} from "./health";

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

function encodeS3Path(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveLocalCoverPath(objectKey: string) {
  return `/covers/${encodeS3Path(trimLeadingSlash(objectKey.trim()))}`;
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getDateStamp(amzDate: string) {
  return amzDate.slice(0, 8);
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, "s3");

  return hmacSha256(serviceKey, "aws4_request");
}

function getS3ObjectUrl(config: S3StorageConfig, objectKey: string) {
  const normalizedObjectKey = trimLeadingSlash(objectKey.trim());
  const encodedObjectKey = encodeS3Path(normalizedObjectKey);

  if (config.forcePathStyle) {
    return new URL(`${config.endpoint}/${config.bucket}/${encodedObjectKey}`);
  }

  const endpointUrl = new URL(config.endpoint);
  endpointUrl.hostname = `${config.bucket}.${endpointUrl.hostname}`;
  endpointUrl.pathname = `/${encodedObjectKey}`;

  return endpointUrl;
}

function getS3BucketUrl(config: S3StorageConfig) {
  if (config.forcePathStyle) {
    return new URL(`${config.endpoint}/${config.bucket}`);
  }

  const endpointUrl = new URL(config.endpoint);
  endpointUrl.hostname = `${config.bucket}.${endpointUrl.hostname}`;
  endpointUrl.pathname = "/";

  return endpointUrl;
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

export function resolveCoverUrl(coverUrl: string | null) {
  const normalizedCoverUrl = coverUrl?.trim();

  if (!normalizedCoverUrl) {
    return null;
  }

  if (isAbsoluteUrl(normalizedCoverUrl)) {
    return normalizedCoverUrl;
  }

  return resolveLocalCoverPath(normalizedCoverUrl);
}

function buildS3AuthorizationHeader(input: {
  config: S3StorageConfig;
  method: "DELETE" | "GET" | "HEAD" | "PUT";
  url: URL;
  amzDate: string;
  payloadHash: string;
  contentType?: string;
}) {
  const dateStamp = getDateStamp(input.amzDate);
  const host = input.url.host;
  const signedHeaders = input.contentType
    ? "content-type;host;x-amz-content-sha256;x-amz-date"
    : "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    input.contentType ? `content-type:${input.contentType}` : null,
    `host:${host}`,
    `x-amz-content-sha256:${input.payloadHash}`,
    `x-amz-date:${input.amzDate}`,
    "",
  ]
    .filter((header): header is string => header !== null)
    .join("\n");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    getSigningKey(input.config.secretAccessKey, dateStamp, input.config.region),
  )
    .update(stringToSign)
    .digest("hex");

  return [
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
}

export async function fetchS3Object(input: {
  objectKey: string;
  env?: S3StorageEnv;
}) {
  const config = getS3StorageConfig(input.env);

  if (!config) {
    return null;
  }

  const url = getS3ObjectUrl(config, input.objectKey);
  const amzDate = formatAmzDate(new Date());
  const payloadHash = sha256Hex("");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: buildS3AuthorizationHeader({
        config,
        method: "GET",
        url,
        amzDate,
        payloadHash,
      }),
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response;
}

export async function checkMinioHealth(): Promise<ServiceHealthCheck> {
  const startedAt = Date.now();
  const config = getS3StorageConfig();

  if (!config) {
    return buildMissingServiceConfigHealthCheck({
      code: "minio",
      name: "MinIO / S3",
      message: "S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID или S3_SECRET_ACCESS_KEY не заданы.",
    });
  }

  try {
    const url = getS3BucketUrl(config);
    const amzDate = formatAmzDate(new Date());
    const payloadHash = sha256Hex("");
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        Authorization: buildS3AuthorizationHeader({
          config,
          method: "HEAD",
          url,
          amzDate,
          payloadHash,
        }),
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": amzDate,
      },
    });

    if (!response.ok) {
      return buildServiceHealthCheck({
        code: "minio",
        name: "MinIO / S3",
        status: "unhealthy",
        message: `Бакет недоступен, статус ${response.status}.`,
        startedAt,
      });
    }

    return buildServiceHealthCheck({
      code: "minio",
      name: "MinIO / S3",
      status: "healthy",
      message: "Бакет доступен.",
      startedAt,
    });
  } catch (error) {
    return buildServiceHealthCheck({
      code: "minio",
      name: "MinIO / S3",
      status: "unhealthy",
      message: getErrorMessage(error),
      startedAt,
    });
  }
}

export async function uploadS3Object(input: {
  objectKey: string;
  body: Buffer;
  contentType: string;
  env?: S3StorageEnv;
}) {
  const config = getS3StorageConfig(input.env);

  if (!config) {
    throw new Error("S3 storage is not configured.");
  }

  const url = getS3ObjectUrl(config, input.objectKey);
  const amzDate = formatAmzDate(new Date());
  const payloadHash = sha256Hex(input.body);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: buildS3AuthorizationHeader({
        config,
        method: "PUT",
        url,
        amzDate,
        payloadHash,
        contentType: input.contentType,
      }),
      "Content-Type": input.contentType,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
    body: new Uint8Array(input.body),
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed with status ${response.status}.`);
  }
}

export async function deleteS3Object(input: {
  objectKey: string;
  env?: S3StorageEnv;
}) {
  const config = getS3StorageConfig(input.env);

  if (!config) {
    throw new Error("S3 storage is not configured.");
  }

  const url = getS3ObjectUrl(config, input.objectKey);
  const amzDate = formatAmzDate(new Date());
  const payloadHash = sha256Hex("");
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: buildS3AuthorizationHeader({
        config,
        method: "DELETE",
        url,
        amzDate,
        payloadHash,
      }),
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`S3 delete failed with status ${response.status}.`);
  }
}
