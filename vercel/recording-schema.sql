CREATE TABLE IF NOT EXISTS cucac.recordings (
 id text PRIMARY KEY,
 phase_id integer REFERENCES cucac.phases(id) ON DELETE SET NULL,
 candidate_id integer REFERENCES cucac.users(id) ON DELETE SET NULL,
 entry_id integer REFERENCES cucac.duet_entries(id) ON DELETE SET NULL,
 uploaded_by integer REFERENCES cucac.users(id) ON DELETE SET NULL,
 object_key text NOT NULL UNIQUE,
 mime text NOT NULL,
 size integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recordings_phase ON cucac.recordings(phase_id);
CREATE INDEX IF NOT EXISTS recordings_candidate ON cucac.recordings(candidate_id);
CREATE INDEX IF NOT EXISTS recordings_entry ON cucac.recordings(entry_id);
CREATE INDEX IF NOT EXISTS recordings_uploader ON cucac.recordings(uploaded_by);
ALTER TABLE cucac.recordings ENABLE ROW LEVEL SECURITY;
