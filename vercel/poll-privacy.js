// Older polls have no explicit consent to identify ballots and remain anonymous.
export const isAnonymousPoll=phase=>phase.is_anonymous!==false;
export const canInspectBallots=(phase,user)=>!isAnonymousPoll(phase)&&(user.isAdmin||user.id===phase.created_by);
export async function ensurePollPrivacy(pool){
 const exists=(await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='cucac' AND table_name='phases' AND column_name='is_anonymous'")).rows.length;
 if(!exists)await pool.query('ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true');
}
