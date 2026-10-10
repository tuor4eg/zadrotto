ALTER TABLE genre_requests DROP CONSTRAINT genre_requests_resolution_check;
--> statement-breakpoint
ALTER TABLE genre_requests ADD CONSTRAINT genre_requests_resolution_check CHECK (
 (decision IS NULL AND resolved_at IS NULL AND apply_status IN ('pending', 'applying', 'failed'))
 OR (decision IS NOT NULL AND resolved_at IS NOT NULL AND apply_status <> 'pending')
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION preserve_genre_request_job_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.type <> 'media.genre-request-apply' THEN RETURN OLD; END IF;
 UPDATE genre_requests SET
  apply_status = CASE WHEN OLD.status = 'succeeded' THEN CASE WHEN decision IS NULL THEN 'pending' ELSE 'processed' END ELSE 'failed' END,
  job_error = CASE WHEN OLD.status = 'succeeded' THEN NULL ELSE coalesce(left(OLD.error_message, 1000), job_error, 'Задача была отменена или удалена до завершения.') END,
  updated_at = now()
 WHERE job_run_id = OLD.id;
 RETURN OLD;
END $$;
