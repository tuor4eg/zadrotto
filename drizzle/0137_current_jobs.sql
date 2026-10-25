CREATE INDEX job_runs_current_idx ON job_runs (status DESC,created_at,id) WHERE status IN ('queued','running');
