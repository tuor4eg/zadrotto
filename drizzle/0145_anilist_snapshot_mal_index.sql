CREATE INDEX provider_snapshots_anilist_mal_idx ON provider_snapshots ((payload->>'idMal')) WHERE provider_code='anilist' AND resource_type='anime' AND api_method='anime.creators';
