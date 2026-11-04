ALTER TABLE "provider_credentials" RENAME CONSTRAINT "cover_provider_credentials_pkey" TO "provider_credentials_pk";--> statement-breakpoint
ALTER TABLE "provider_rate_limits" RENAME CONSTRAINT "cover_provider_rate_limits_pkey" TO "provider_rate_limits_pk";
