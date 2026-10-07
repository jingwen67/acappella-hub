import {randomInt} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createVoting(pool){return {async action(id,action,user,body={}){
 const c=await pool.connect();try{await c.query('BEGIN');
 const p=(await c.query('SELECT * FROM cucac.phases WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p)throw fail(404,'phase_missing');
 if(action==='reveal'){
  if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
  if(p.status!=='closed')throw fail(400,'phase_not_closed');
  await c.query('UPDATE cucac.phases SET revealed_ranks=revealed_ranks+1 WHERE id=$1',[id]);
 }else{
  if(p.status!=='open')throw fail(400,'phase_closed');
  const candidates=(await c.query('SELECT user_id FROM cucac.candidacies WHERE phase_id=$1 ORDER BY created_at,user_id',[id])).rows.map(r=>r.user_id);
  if(action==='start'){
   if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
   if(p.started_at)throw fail(409,'voting_started');
   if(candidates.length<2)throw fail(400,'need_two_candidates');
   for(let i=candidates.length-1;i>0;i--){const j=randomInt(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
   await c.query('UPDATE cucac.phases SET started_at=$1,registration_locked=$2,candidate_order=$3 WHERE id=$4',[new Date().toISOString(),candidates.length===2?1:0,JSON.stringify(candidates),id]);
  }else if(action==='close'){
   if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
   await c.query("UPDATE cucac.phases SET status='closed',closed_at=$1 WHERE id=$2",[new Date().toISOString(),id]);
  }else if(action==='candidacy'){
   if(p.registration_locked)throw fail(403,'registration_locked');
   if(body.join){if(!candidates.includes(user.id)){
    await c.query('INSERT INTO cucac.candidacies(phase_id,user_id,created_at) VALUES($1,$2,$3)',[id,user.id,new Date().toISOString()]);
    if(p.started_at){const order=JSON.parse(p.candidate_order);order.push(user.id);await c.query('UPDATE cucac.phases SET candidate_order=$1 WHERE id=$2',[JSON.stringify(order),id]);}
   }}else{
    // Keep an active default round at three or more candidates so existing two-vote ballots remain valid.
    if(p.started_at&&p.voting_mode==='default'&&candidates.includes(user.id)&&candidates.length<=3)throw fail(403,'withdraw_locked');
    await c.query('DELETE FROM cucac.votes WHERE phase_id=$1 AND candidate_id=$2',[id,user.id]);
    await c.query('DELETE FROM cucac.candidacies WHERE phase_id=$1 AND user_id=$2',[id,user.id]);
   }
  }else if(action==='vote'){
   if(!p.started_at)throw fail(403,'voting_not_started');
   const candidate=Number(body.candidateId);if(!candidates.includes(candidate))throw fail(400,'not_candidate');
   if(body.reaction==null){await c.query('DELETE FROM cucac.votes WHERE phase_id=$1 AND voter_id=$2 AND candidate_id=$3',[id,user.id,candidate]);}
   else{
    if(!['like','again'].includes(body.reaction)||(p.voting_mode==='default'&&body.reaction!=='like'))throw fail(400,'bad_reaction');
    if(p.voting_mode==='default'){
     const n=(await c.query('SELECT count(*)::int AS n FROM cucac.votes WHERE phase_id=$1 AND voter_id=$2 AND candidate_id<>$3',[id,user.id,candidate])).rows[0].n;
     if(n>=(p.registration_locked?1:2))throw fail(400,'vote_limit');
    }
    await c.query('INSERT INTO cucac.votes(phase_id,voter_id,candidate_id,reaction) VALUES($1,$2,$3,$4) ON CONFLICT(phase_id,voter_id,candidate_id) DO UPDATE SET reaction=excluded.reaction',[id,user.id,candidate,body.reaction]);
   }
  }else throw fail(400,'bad_action');
 }
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}};}
