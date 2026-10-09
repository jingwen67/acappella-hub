
-- Configurable number of voting parts; keep legacy A/B/C round data.
ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS part_labels jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cucac.duet_entries DROP CONSTRAINT IF EXISTS duet_entries_part_check;
ALTER TABLE cucac.duet_entries ADD CONSTRAINT duet_entries_part_check CHECK(part IN ('pair','A','B','C') OR part ~ '^part_[1-9][0-9]*$');
ALTER TABLE cucac.duet_entries DROP CONSTRAINT IF EXISTS duet_entries_check;
ALTER TABLE cucac.duet_entries ADD CONSTRAINT duet_entries_check CHECK((part='pair' AND member2 IS NOT NULL AND member1<member2) OR (part<>'pair' AND member2 IS NULL AND confirmed=1));
DROP INDEX IF EXISTS cucac.duet_part_unique;
CREATE UNIQUE INDEX duet_part_unique ON cucac.duet_entries(phase_id,member1,part) WHERE part<>'pair';
