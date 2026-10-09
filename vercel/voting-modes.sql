ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS voting_mode text NOT NULL DEFAULT 'feedback' CHECK(voting_mode IN ('default','feedback'));
ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS started_at text;
ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS registration_locked integer NOT NULL DEFAULT 0;
ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS candidate_order text NOT NULL DEFAULT '[]';
ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS revealed_ranks integer NOT NULL DEFAULT 2 CHECK(revealed_ranks>=2);
-- Existing rounds retain the old feedback mechanism and remain available for voting.
UPDATE cucac.phases SET started_at=created_at WHERE voting_mode='feedback' AND started_at IS NULL;
