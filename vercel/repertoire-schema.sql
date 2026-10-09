ALTER TABLE cucac.plan_terms ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS plan_one_current_term ON cucac.plan_terms(is_current) WHERE is_current;
UPDATE cucac.plan_terms SET is_current=true WHERE id=(SELECT id FROM cucac.plan_terms WHERE NOT archived ORDER BY created_at DESC,id DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM cucac.plan_terms WHERE is_current);
CREATE TABLE IF NOT EXISTS cucac.plan_cast (
 song_id integer NOT NULL REFERENCES cucac.plan_songs(id) ON DELETE CASCADE,
 member_key integer NOT NULL,
 member_id integer REFERENCES cucac.users(id) ON DELETE SET NULL,
 member_name text NOT NULL,
 part text NOT NULL CHECK(part IN ('solo','soprano','alto','tenor','baritone','bass','bbox','rap')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(song_id,member_key,part)
);
CREATE INDEX IF NOT EXISTS plan_cast_member_idx ON cucac.plan_cast(member_id);
ALTER TABLE cucac.plan_cast ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON cucac.plan_cast FROM anon; END IF; IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON cucac.plan_cast FROM authenticated; END IF; END $$;
INSERT INTO cucac.plan_cast(song_id,member_key,member_id,member_name,part,created_at) SELECT song_id,member_key,member_id,member_name,part,created_at FROM cucac.plan_entries ON CONFLICT(song_id,member_key,part) DO NOTHING;
