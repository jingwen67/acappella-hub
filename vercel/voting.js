import {randomInt} from 'node:crypto';
import {duetAction,duetView} from './duets.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createVoting(pool){return {view:(phase,user)=>duetView(pool,phase,user),async action(id,action,user,body={}){
 const c=await pool.connect();try{await c.query('BEGIN');
 const p=(await c.query('SELECT * FROM cucac.phases WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p)throw fail(404,'phase_missing');
 if(action==='reveal'){
  if(!user.isMd||user.isAdmin)throw fail(403,'forbidden');
  if(p.status!=='closed')throw fail(400,'phase_not_closed');
  await c.query('UPDATE cucac.phases SET revealed_ranks=revealed_ranks+1 WHERE id=$1',[id]);
 }else{
  if(p.status!=='open')throw fail(400,'phase_closed');
  if(p.poll_type&&p.poll_type!=='solo'){await duetAction(c,p,action,user,body);}else{
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
   if(p.plan_song_id){
    const target=(await c.query('SELECT t.archived FROM cucac.plan_terms t JOIN cucac.plan_songs s ON s.term_id=t.id WHERE s.id=$1 AND NOT s.excluded FOR UPDATE OF t',[p.plan_song_id])).rows[0];
    if(target&&!target.archived){
     const ranked=(await c.query(`SELECT u.id,u.name,u.full_name,count(v.candidate_id) FILTER (WHERE v.reaction='like')::int AS likes FROM cucac.candidacies ca JOIN cucac.users u ON u.id=ca.user_id LEFT JOIN cucac.votes v ON v.phase_id=ca.phase_id AND v.candidate_id=ca.user_id WHERE ca.phase_id=$1 GROUP BY u.id ORDER BY likes DESC,u.id`,[id])).rows;
     const top=ranked[0]?.likes;
     for(const winner of ranked.filter(r=>r.likes===top))await c.query("INSERT INTO cucac.plan_cast(song_id,member_key,member_id,member_name,part) VALUES($1,$2,$2,$3,'solo') ON CONFLICT(song_id,member_key,part) DO UPDATE SET member_name=excluded.member_name",[p.plan_song_id,winner.id,winner.full_name||winner.name]);
    }
   }
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
    await c.query('UPDATE cucac.recordings SET candidate_id=NULL WHERE phase_id=$1 AND candidate_id=$2',[id,user.id]);
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
 }
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}};}
