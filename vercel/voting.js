import {randomInt} from 'node:crypto';
import {duetAction,duetView} from './duets.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createVoting(pool){return {async progress(phase,user){
 if(phase.started_at&&(user.isMd||user.isAdmin))await pool.query('INSERT INTO cucac.vote_presence(phase_id,user_id,last_seen,joined_at) VALUES($1,$2,now(),now()) ON CONFLICT(phase_id,user_id) DO UPDATE SET joined_at=excluded.joined_at WHERE cucac.vote_presence.joined_at IS NULL',[phase.id,user.id]);
 const participating=Boolean((await pool.query('SELECT joined_at FROM cucac.vote_presence WHERE phase_id=$1 AND user_id=$2',[phase.id,user.id])).rows[0]?.joined_at);
 const own=(await pool.query('SELECT ballot,submitted_at FROM cucac.vote_submissions WHERE phase_id=$1 AND voter_id=$2',[phase.id,user.id])).rows[0];
 const submittedBallot=own?{phaseId:phase.id,submittedAt:new Date(own.submitted_at).toISOString(),votes:own.ballot}:null;
 if(user.id!==phase.created_by)return {submittedBallot,participating};
 const stats=(await pool.query(`SELECT count(*)::int AS total,count(s.voter_id)::int AS submitted,count(pr.user_id)::int AS visited,count(pr.user_id) FILTER (WHERE pr.last_seen>now()-interval '60 seconds')::int AS online FROM cucac.users u LEFT JOIN cucac.vote_submissions s ON s.voter_id=u.id AND s.phase_id=$1 LEFT JOIN cucac.vote_presence pr ON pr.user_id=u.id AND pr.phase_id=$1 WHERE u.is_admin=0 AND pr.joined_at IS NOT NULL`,[phase.id])).rows[0];
 return {submittedBallot,participating,voteProgress:{...stats,complete:stats.total>0&&stats.submitted===stats.total}};
},view:(phase,user)=>duetView(pool,phase,user),async action(id,action,user,body={}){
 let receipt;const c=await pool.connect();try{await c.query('BEGIN');
 const p=(await c.query('SELECT * FROM cucac.phases WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p)throw fail(404,'phase_missing');
 if(action==='edit'){
  if(!user.isMd)throw fail(403,'forbidden');if(p.status!=='closed'||p.poll_type!=='solo')throw fail(400,'phase_not_closed');
  if(typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>40)throw fail(400,'title_required');let title=body.title.trim();const songId=body.planSongId?Number(body.planSongId):null;if(songId){if(!Number.isInteger(songId))throw fail(400,'plan_invalid');const song=(await c.query('SELECT title FROM cucac.plan_songs WHERE id=$1',[songId])).rows[0];if(!song)throw fail(404,'plan_missing');title=song.title+'-'+title;}await c.query('UPDATE cucac.phases SET title=$1,plan_song_id=$2 WHERE id=$3',[title,songId,id]);
 }else if(action==='reveal'){
  if(!user.isMd||user.isAdmin)throw fail(403,'forbidden');
  if(p.status!=='closed')throw fail(400,'phase_not_closed');
  await c.query('UPDATE cucac.phases SET revealed_ranks=revealed_ranks+1 WHERE id=$1',[id]);
 }else{
  if(p.status!=='open')throw fail(400,'phase_closed');
  if(p.poll_type&&p.poll_type!=='solo'&&!['enter','presence'].includes(action)){receipt=await duetAction(c,p,action,user,body);if(action==='vote')await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND voter_id=$2',[id,user.id]);}else{
  const candidates=(await c.query('SELECT user_id FROM cucac.candidacies WHERE phase_id=$1 ORDER BY created_at,user_id',[id])).rows.map(r=>r.user_id);
  if(action==='submit'){
   if(!p.started_at)throw fail(403,'voting_not_started');
   const votes=(await c.query('SELECT v.candidate_id,v.reaction,u.name FROM cucac.votes v JOIN cucac.candidacies ca ON ca.phase_id=v.phase_id AND ca.user_id=v.candidate_id JOIN cucac.users u ON u.id=v.candidate_id WHERE v.phase_id=$1 AND v.voter_id=$2 ORDER BY v.candidate_id',[id,user.id])).rows;
   
   const normalized=items=>JSON.stringify(items.map(v=>({candidateId:Number(v.candidateId??v.candidate_id),reaction:v.reaction})).sort((a,b)=>a.candidateId-b.candidateId));
   if(!Array.isArray(body.votes)||!body.votes.every(v=>v&&Number.isInteger(v.candidateId)&&['like','again'].includes(v.reaction))||normalized(body.votes)!==normalized(votes))throw fail(409,'ballot_changed');
   receipt={phaseId:id,submittedAt:new Date().toISOString(),votes:votes.map(v=>({candidateId:v.candidate_id,reaction:v.reaction,name:v.name}))};
   await c.query('INSERT INTO cucac.vote_submissions(phase_id,voter_id,ballot,submitted_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(phase_id,voter_id) DO UPDATE SET ballot=excluded.ballot,submitted_at=excluded.submitted_at',[id,user.id,JSON.stringify(receipt.votes),receipt.submittedAt]);
  }else if(action==='enter'){
   await c.query('INSERT INTO cucac.vote_presence(phase_id,user_id,last_seen,joined_at) VALUES($1,$2,now(),now()) ON CONFLICT(phase_id,user_id) DO UPDATE SET joined_at=coalesce(cucac.vote_presence.joined_at,excluded.joined_at),last_seen=excluded.last_seen',[id,user.id]);
  }else if(action==='presence'){
   if(body.active===false)await c.query("UPDATE cucac.vote_presence SET last_seen='epoch'::timestamptz WHERE phase_id=$1 AND user_id=$2",[id,user.id]);
   else await c.query('INSERT INTO cucac.vote_presence(phase_id,user_id,last_seen) VALUES($1,$2,now()) ON CONFLICT(phase_id,user_id) DO UPDATE SET last_seen=excluded.last_seen',[id,user.id]);
  }else if(action==='start'){
   if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
   if(p.started_at)throw fail(409,'voting_started');
   if(candidates.length<2)throw fail(400,'need_two_candidates');
   for(let i=candidates.length-1;i>0;i--){const j=randomInt(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
   await c.query('UPDATE cucac.phases SET started_at=$1,registration_locked=$2,candidate_order=$3 WHERE id=$4',[new Date().toISOString(),candidates.length===2?1:0,JSON.stringify(candidates),id]);
  }else if(action==='close'){
   if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
   const resultRows=(await c.query(`SELECT u.id,u.name,count(v.candidate_id) FILTER (WHERE v.reaction='like')::int AS likes,count(v.candidate_id) FILTER (WHERE v.reaction='again')::int AS again FROM cucac.candidacies ca JOIN cucac.users u ON u.id=ca.user_id LEFT JOIN cucac.votes v ON v.phase_id=ca.phase_id AND v.candidate_id=ca.user_id WHERE ca.phase_id=$1 GROUP BY u.id,u.name`,[id])).rows.sort((a,b)=>b.likes-a.likes||a.name.localeCompare(b.name,'zh'));
   let rank=0,last=null;const snapshot=resultRows.map(row=>{if(row.likes!==last){rank++;last=row.likes;}return {...row,rank};});
   await c.query("UPDATE cucac.phases SET status='closed',closed_at=$1,solo_results=$2::jsonb WHERE id=$3",[new Date().toISOString(),JSON.stringify(snapshot),id]);
  }else if(action==='candidacy'){
   if(p.registration_locked)throw fail(403,'registration_locked');
   if(body.join){if(!candidates.includes(user.id)){
    await c.query('INSERT INTO cucac.candidacies(phase_id,user_id,created_at) VALUES($1,$2,$3)',[id,user.id,new Date().toISOString()]);
    if(p.started_at){const order=JSON.parse(p.candidate_order);order.push(user.id);await c.query('UPDATE cucac.phases SET candidate_order=$1 WHERE id=$2',[JSON.stringify(order),id]);}
   }}else{
    // Keep an active default round at three or more candidates so existing two-vote ballots remain valid.
    if(p.started_at&&p.voting_mode==='default'&&candidates.includes(user.id)&&candidates.length<=3)throw fail(403,'withdraw_locked');
    await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND ballot @> $2::jsonb',[id,JSON.stringify([{candidateId:user.id}])]);
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
  if(action==='vote')await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND voter_id=$2',[id,user.id]);
  }
 }
 await c.query('COMMIT');return receipt;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}};}
