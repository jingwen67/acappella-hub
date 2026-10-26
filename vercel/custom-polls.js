const fail=(status,message)=>Object.assign(new Error(message),{status});
// Keep the legacy phase type unchanged for existing deployments; the reserved marker
// distinguishes custom options from singer candidacies throughout the API.
export const isCustomRound=phase=>phase?.part_a==='__custom_poll_v1__';
export const customPollSchema=`
CREATE TABLE IF NOT EXISTS cucac.custom_votes (
 phase_id integer NOT NULL REFERENCES cucac.phases(id) ON DELETE CASCADE,
 voter_id integer NOT NULL REFERENCES cucac.users(id) ON DELETE CASCADE,
 option_id integer NOT NULL CHECK(option_id>0),
 PRIMARY KEY(phase_id,voter_id,option_id)
);
ALTER TABLE cucac.custom_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON cucac.custom_votes FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON cucac.custom_votes FROM authenticated; END IF;
END $$;`;
const optionsFor=p=>Array.isArray(p.part_labels)?p.part_labels:[];
export async function createCustomPoll(pool,user,body){
 if(!user.isMd)throw fail(403,'cannot_start');
 const title=typeof body.title==='string'?body.title.trim():'';
 if(!title||title.length>40)throw fail(400,'title_required');
 const entries=body.entries;
 if(!Array.isArray(entries)||entries.length<2||entries.length>100||entries.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>120))throw fail(400,'custom_entries');
 const labels=entries.map(v=>v.trim());if(new Set(labels.map(v=>v.normalize('NFKC').toLowerCase())).size!==labels.length)throw fail(400,'custom_duplicate');
 const limit=body.maxVotes;if(!Number.isInteger(limit)||limit<1||limit>labels.length)throw fail(400,'custom_limit');
 const c=await pool.connect();try{
  await c.query('BEGIN');
  // Serialize additive first-use initialization across both concurrent creates and cold starts.
  await c.query('SELECT pg_advisory_xact_lock(748220)');
  await c.query(customPollSchema);
  const now=new Date().toISOString();
  const row=(await c.query(`INSERT INTO cucac.phases(title,status,created_by,created_at,started_at,voting_mode,poll_type,part_a,part_b,part_labels,registration_locked,is_anonymous) VALUES($1,'open',$2,$3,$3,'default','solo','__custom_poll_v1__',$4,$5::jsonb,1,$6) RETURNING id`,[title,user.id,now,String(limit),JSON.stringify(labels),body.anonymous!==false])).rows[0];
  await c.query('COMMIT');return row.id;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export async function customView(pool,p,user){
 let candidates;
 if(p.status==='closed'&&Array.isArray(p.solo_results))candidates=p.solo_results;
 else{
  const rows=(await pool.query('SELECT option_id,count(*)::int AS likes FROM cucac.custom_votes WHERE phase_id=$1 GROUP BY option_id',[p.id])).rows;
  const own=new Set((await pool.query('SELECT option_id FROM cucac.custom_votes WHERE phase_id=$1 AND voter_id=$2',[p.id,user.id])).rows.map(row=>row.option_id));
  candidates=optionsFor(p).map((name,i)=>({id:i+1,name,likes:rows.find(row=>row.option_id===i+1)?.likes||0,again:0,mine:own.has(i+1)?'like':null}));
 }
 if(p.status==='closed'){
  candidates=[...candidates].sort((a,b)=>b.likes-a.likes||a.id-b.id);let rank=0,last=null;
  candidates=candidates.map(row=>{if(row.likes!==last){rank++;last=row.likes;}return {...row,rank};});
  candidates=candidates.filter(row=>user.isAdmin||row.rank<=p.revealed_ranks);
 }
 return {pollType:'custom',voteLimit:Number(p.part_b),candidateCount:optionsFor(p).length,iAmCandidate:false,candidates:candidates.map(row=>user.isAdmin?{...row,isMe:false}:{id:row.id,name:row.name,mine:row.mine||null,rank:row.rank,isMe:false})};
}
export async function customAction(c,p,action,user,body){
 if(action==='reveal'){
  if(user.id!==p.created_by||user.isAdmin)throw fail(403,'forbidden');if(p.status!=='closed')throw fail(400,'phase_not_closed');
  await c.query('UPDATE cucac.phases SET revealed_ranks=revealed_ranks+1 WHERE id=$1',[p.id]);return;
 }
 if(p.status!=='open')throw fail(400,'phase_closed');
 if(action==='close'){
  if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
  const result=await customView(c,p,{...user,isAdmin:true});
  const snapshot=result.candidates.map(({id,name,likes,again})=>({id,name,likes,again}));
  await c.query("UPDATE cucac.phases SET status='closed',closed_at=$1,solo_results=$2::jsonb WHERE id=$3",[new Date().toISOString(),JSON.stringify(snapshot),p.id]);return;
 }
 if(!['vote','submit'].includes(action))throw fail(400,'bad_action');
 const joined=(await c.query('SELECT joined_at FROM cucac.vote_presence WHERE phase_id=$1 AND user_id=$2',[p.id,user.id])).rows[0]?.joined_at;
 if(!joined&&!user.isMd&&!user.isAdmin)throw fail(403,'join_poll_first');
 if(action==='vote'){
  const id=body.candidateId;if(!Number.isInteger(id)||id<1||id>optionsFor(p).length)throw fail(400,'not_candidate');
  if(body.reaction==null)await c.query('DELETE FROM cucac.custom_votes WHERE phase_id=$1 AND voter_id=$2 AND option_id=$3',[p.id,user.id,id]);
  else{
   if(body.reaction!=='like')throw fail(400,'bad_reaction');
   const n=(await c.query('SELECT count(*)::int AS n FROM cucac.custom_votes WHERE phase_id=$1 AND voter_id=$2 AND option_id<>$3',[p.id,user.id,id])).rows[0].n;
   if(n>=Number(p.part_b))throw fail(400,'vote_limit');
   await c.query('INSERT INTO cucac.custom_votes(phase_id,voter_id,option_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.id,user.id,id]);
  }
  await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND voter_id=$2',[p.id,user.id]);return;
 }
 const selected=(await c.query('SELECT option_id FROM cucac.custom_votes WHERE phase_id=$1 AND voter_id=$2 ORDER BY option_id',[p.id,user.id])).rows.map(row=>row.option_id);
 const provided=Array.isArray(body.votes)&&body.votes.every(v=>v&&Number.isInteger(v.candidateId)&&v.reaction==='like')?body.votes.map(v=>v.candidateId).sort((a,b)=>a-b):null;
 if(!provided||JSON.stringify(selected)!==JSON.stringify(provided))throw fail(409,'ballot_changed');
 const receipt={phaseId:p.id,submittedAt:new Date().toISOString(),votes:selected.map(id=>({candidateId:id,reaction:'like',name:optionsFor(p)[id-1]}))};
 await c.query('INSERT INTO cucac.vote_submissions(phase_id,voter_id,ballot,submitted_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(phase_id,voter_id) DO UPDATE SET ballot=excluded.ballot,submitted_at=excluded.submitted_at',[p.id,user.id,JSON.stringify(receipt.votes),receipt.submittedAt]);return receipt;
}
