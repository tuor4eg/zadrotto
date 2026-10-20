ALTER TABLE provider_settings ADD COLUMN normalized_book_metadata boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Preserve the existing runtime defaults when seeding missing settings for row locking.
INSERT INTO provider_settings(media_type, provider_code, enabled, title_search_mode, cover_search_enabled, priority)
VALUES ('book','fantlab',true,'parallel',true,30), ('book','google-books',true,'parallel',true,20), ('book','open-library',true,'parallel',true,10)
ON CONFLICT (media_type,provider_code) DO NOTHING;
