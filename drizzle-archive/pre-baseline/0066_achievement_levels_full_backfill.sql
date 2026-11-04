INSERT INTO "job_runs" (
	"type", "payload", "source", "scheduled_for", "available_at",
	"max_attempts", "timeout_seconds", "retry_base_seconds", "retry_max_seconds"
)
SELECT
	'achievements.backfill',
	jsonb_build_object('achievementIds', jsonb_agg("id" ORDER BY "id")),
	'event',
	now(),
	now(),
	3,
	300,
	60,
	3600
FROM "achievements"
WHERE "enabled" = true
HAVING count(*) > 0;
