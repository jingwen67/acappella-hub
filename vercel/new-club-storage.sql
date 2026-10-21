INSERT INTO storage.buckets(id,name,public) VALUES('hub-private','hub-private',false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='hub-private' AND public) THEN RAISE EXCEPTION 'Hub storage bucket must be private'; END IF; END $$;
