ALTER TABLE cucac.invitations ADD COLUMN IF NOT EXISTS is_shared integer NOT NULL DEFAULT 0 CHECK (is_shared IN (0,1));
ALTER TABLE cucac.invitations ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0);
