ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS plan_song_id bigint REFERENCES cucac.plan_songs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS phases_plan_song_idx ON cucac.phases(plan_song_id) WHERE plan_song_id IS NOT NULL;
UPDATE cucac.plan_songs SET locked=true WHERE big_song;
