/** Database dumps may use a separate private bucket with the same S3 connection credentials. */
export function getAdminExportStorageEnv(entityType: string) {
  if (entityType !== "database_dump") return undefined;
  return {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.ADMIN_EXPORTS_S3_BUCKET?.trim() || process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  };
}
