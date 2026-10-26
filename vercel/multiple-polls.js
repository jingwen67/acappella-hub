// Removing the singleton index preserves every existing round and ballot.
export async function ensureMultiplePolls(pool){
 const exists=(await pool.query("SELECT to_regclass('cucac.one_open_phase') AS singleton")).rows[0]?.singleton;
 if(exists)await pool.query('DROP INDEX IF EXISTS cucac.one_open_phase');
}
