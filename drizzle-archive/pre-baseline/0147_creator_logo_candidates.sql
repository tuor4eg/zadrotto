CREATE TABLE creator_logo_candidates (
  request_id integer NOT NULL REFERENCES creator_requests(id) ON DELETE CASCADE,
  creator_id integer NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  anilist_studio_id text NOT NULL,
  decision text,
  resolved_by_admin_id integer REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, creator_id),
  CONSTRAINT creator_logo_candidates_studio_check CHECK (anilist_studio_id ~ '^studio:[1-9][0-9]*$'),
  CONSTRAINT creator_logo_candidates_decision_check CHECK (decision IS NULL OR decision IN ('map','reject')),
  CONSTRAINT creator_logo_candidates_resolution_check CHECK ((decision IS NULL) = (resolved_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX creator_logo_candidates_creator_idx ON creator_logo_candidates(creator_id);
--> statement-breakpoint
CREATE INDEX creator_logo_candidates_admin_idx ON creator_logo_candidates(resolved_by_admin_id);
--> statement-breakpoint
-- Preserve proven logo-search origins. Never infer rejection intent from a global ignore:
-- old exclusions remain unchanged until an administrator explicitly reviews them.
INSERT INTO creator_logo_candidates(request_id, creator_id, anilist_studio_id, decision, resolved_at)
SELECT r.id, c.id, source.studio_id,
       CASE WHEN b.creator_id IS NOT NULL AND r.decision IN ('map','create') THEN 'map' END,
       CASE WHEN b.creator_id IS NOT NULL AND r.decision IN ('map','create') THEN coalesce(r.resolved_at,now()) END
FROM game_company_profiles p
JOIN creator_requests r ON r.provider='tmdb' AND r.external_creator_id=p.external_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.details->'suggestedCreatorIds')='array' THEN p.details->'suggestedCreatorIds' ELSE '[]'::jsonb END
) AS candidate(value)
JOIN creators c ON c.id = CASE
  WHEN jsonb_typeof(candidate.value)='number' AND candidate.value::text ~ '^[1-9][0-9]{0,9}$'
  THEN CASE WHEN (candidate.value::text)::bigint <= 2147483647 THEN (candidate.value::text)::integer END
END
JOIN LATERAL (
  SELECT min(external_creator_id) AS studio_id
  FROM provider_creator_bindings
  WHERE creator_id=c.id AND provider='anilist' AND active AND external_creator_id ~ '^studio:[1-9][0-9]*$'
  HAVING count(*)=1
) source ON true
LEFT JOIN provider_creator_bindings b ON b.provider='tmdb' AND b.external_creator_id=r.external_creator_id AND b.creator_id=c.id AND b.active
WHERE p.provider='tmdb' AND p.external_id ~ '^company:[1-9][0-9]*$'
  AND p.details->>'anilistStudioId' ~ '^studio:[1-9][0-9]*$'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Retire only untouched, logo-only search envelopes that cannot supply an image.
-- Keep explicit decisions, global exclusions, jobs, bindings and real participation.
DELETE FROM creator_requests r
USING game_company_profiles p
WHERE r.provider='tmdb' AND r.media_type='anime' AND r.external_creator_id=p.external_id
  AND p.provider='tmdb' AND p.image_status='missing' AND p.image_url IS NULL
  AND r.decision IS NULL AND r.job_run_id IS NULL AND NOT r.manually_reopened
  AND r.apply_status='pending'
  AND EXISTS (SELECT 1 FROM creator_logo_candidates l WHERE l.request_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM creator_logo_candidates l WHERE l.request_id=r.id AND l.decision IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM creator_request_media_items o WHERE o.request_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM provider_creator_bindings b WHERE b.provider='tmdb' AND b.external_creator_id=r.external_creator_id)
  AND NOT EXISTS (SELECT 1 FROM provider_creator_exclusions e WHERE e.provider='tmdb'
    AND (e.external_creator_id=r.external_creator_id OR (e.external_creator_id IS NULL AND e.media_type=r.media_type AND e.normalized_external_creator_name=r.normalized_external_creator_name)));
