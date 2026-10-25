-- Production completion confirmed by the administrator. Stop workers/scheduler
-- before applying. Keep domain data, provider snapshots and job history intact.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM job_runs WHERE status IN ('queued','running') AND type IN (
      'media.tmdb-companies-backfill','media.tmdb-directors-backfill',
      'media.bgg-creators-backfill','media.game-companies-backfill',
      'media.creator-fantlab-bindings','media.creators-backfill','media.genre-series-backfill'
    )
  ) THEN
    RAISE EXCEPTION 'Completed migrations still have active runs; reconcile them before retirement';
  END IF;
  IF EXISTS (SELECT 1 FROM game_company_backfill_items WHERE status IN ('pending','ready','error'))
     OR EXISTS (SELECT 1 FROM game_company_backfills WHERE status IN ('active','partial')) THEN
    RAISE EXCEPTION 'Game company migration checkpoints are unfinished; reconcile them before retirement';
  END IF;
END;
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS job_runs_game_company_backfill_active_unique;
--> statement-breakpoint
DROP TABLE game_company_backfill_items;
--> statement-breakpoint
DROP TABLE game_company_backfills;
