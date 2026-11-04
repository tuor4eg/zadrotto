ALTER TABLE "cover_provider_settings" RENAME TO "provider_settings";--> statement-breakpoint
ALTER TABLE "cover_provider_credentials" RENAME TO "provider_credentials";--> statement-breakpoint
ALTER TABLE "cover_provider_rate_limits" RENAME TO "provider_rate_limits";--> statement-breakpoint
ALTER TABLE "provider_settings" RENAME CONSTRAINT "cover_provider_settings_pk" TO "provider_settings_pk";--> statement-breakpoint
ALTER TABLE "provider_settings" RENAME CONSTRAINT "cover_provider_settings_priority_check" TO "provider_settings_priority_check";--> statement-breakpoint
ALTER TABLE "provider_settings" RENAME CONSTRAINT "cover_provider_settings_media_type_media_types_code_fk" TO "provider_settings_media_type_media_types_code_fk";--> statement-breakpoint
ALTER TABLE "provider_credentials" RENAME CONSTRAINT "cover_provider_credentials_updated_by_admin_id_admin_users_id_fk" TO "provider_credentials_updated_by_admin_id_admin_users_id_fk";--> statement-breakpoint
ALTER TABLE "provider_rate_limits" RENAME CONSTRAINT "cover_provider_rate_limits_searches_per_day_check" TO "provider_rate_limits_searches_per_day_check";
