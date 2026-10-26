import {ensurePollPrivacy} from './poll-privacy.js';
// Explicit owner request on 2026-10-26. Only the already-running CUCAC round
// is eligible. Closed rounds, other clubs and all future rounds are excluded.
export const requestedPollCutoff='2026-10-26T04:08:31Z';
export async function updateRequestedCurrentPoll(pool,profile){
 if(profile&&profile!=='cucac')return [];
 await ensurePollPrivacy(pool);
 return (await pool.query("UPDATE cucac.phases SET is_anonymous=false WHERE status='open' AND created_at::timestamptz<=$1::timestamptz AND is_anonymous=true RETURNING id",[requestedPollCutoff])).rows;
}
