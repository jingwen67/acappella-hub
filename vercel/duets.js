import {randomInt} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const partLabels=p=>Array.isArray(p.part_labels)&&p.part_labels.length?p.part_labels:[p.part_a,p.part_b,...(p.part_c?[p.part_c]:[])];
const parts=p=>partLabels(p).map((_,i)=>['A','B','C'][i]||'part_'+(i+1));
const shuffle=rows=>{const ids=rows.map(row=>row.id);for(let i=ids.length-1;i>0;i--){const j=randomInt(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;};
function auditionUrl(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string'||value.length>2000)throw fail(400,'bad_audition_url');
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw new Error();return url.href;}catch{throw fail(400,'bad_audition_url');}
}
const belongs=(entry,user)=>entry.member1===user.id||entry.member2===user.id;
export async function duetAction(c,p,action,user,body){
 const rows=(await c.query('SELECT * FROM cucac.duet_entries WHERE phase_id=$1 ORDER BY created_at,id',[p.id])).rows;
 const confirmed=rows.filter(row=>row.confirmed===1);
 const locks=JSON.parse(p.part_locks||'{}');
 const isLocked=part=>Boolean(p.started_at&&(p.poll_type==='pair'?p.registration_locked:locks[part]));
 const append=async id=>{if(p.started_at){const order=JSON.parse(p.candidate_order);order.push(id);await c.query('UPDATE cucac.phases SET candidate_order=$1 WHERE id=$2',[JSON.stringify(order),p.id]);}};
 if(action==='submit'){
  if(!p.started_at)throw fail(403,'voting_not_started');
  const votes=(await c.query('SELECT v.entry_id FROM cucac.duet_votes v JOIN cucac.duet_entries e ON e.id=v.entry_id WHERE v.phase_id=$1 AND v.voter_id=$2 AND e.confirmed=1 ORDER BY v.entry_id',[p.id,user.id])).rows;
  const expected=votes.map(v=>v.entry_id),provided=Array.isArray(body.votes)&&body.votes.every(v=>v&&Number.isInteger(v.candidateId)&&v.reaction==='like')?body.votes.map(v=>v.candidateId).sort((a,b)=>a-b):null;
  if(!provided||JSON.stringify(provided)!==JSON.stringify(expected))throw fail(409,'ballot_changed');
  const names=(await c.query('SELECT e.id,u.name AS name1,u.full_name AS full1,v.name AS name2,v.full_name AS full2 FROM cucac.duet_entries e JOIN cucac.users u ON u.id=e.member1 LEFT JOIN cucac.users v ON v.id=e.member2 WHERE e.phase_id=$1',[p.id])).rows;
  const receipt={phaseId:p.id,submittedAt:new Date().toISOString(),votes:expected.map(id=>{const row=names.find(r=>r.id===id);return {candidateId:id,reaction:'like',name:[row.full1||row.name1,row.full2||row.name2].filter(Boolean).join(' + ')};})};
  await c.query('INSERT INTO cucac.vote_submissions(phase_id,voter_id,ballot,submitted_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(phase_id,voter_id) DO UPDATE SET ballot=excluded.ballot,submitted_at=excluded.submitted_at',[p.id,user.id,JSON.stringify(receipt.votes),receipt.submittedAt]);
  return receipt;
 }else if(action==='start'){
  if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
  if(p.started_at)throw fail(409,'voting_started');
  if(p.poll_type==='pair'&&confirmed.length<2)throw fail(400,'need_two_pairs');
  if(p.poll_type==='parts'&&parts(p).some(part=>!confirmed.some(row=>row.part===part)))throw fail(400,'need_both_parts');
  const partLocks=Object.fromEntries(parts(p).map(part=>[part,confirmed.filter(row=>row.part===part).length<=2]));
  await c.query('UPDATE cucac.phases SET started_at=$1,registration_locked=$2,candidate_order=$3,part_locks=$4 WHERE id=$5',[new Date().toISOString(),p.poll_type==='pair'&&confirmed.length===2?1:0,JSON.stringify(shuffle(confirmed)),JSON.stringify(partLocks),p.id]);
 }else if(action==='close'){
  if(!user.isMd&&!user.isAdmin)throw fail(403,'forbidden');
  await c.query("UPDATE cucac.phases SET status='closed',closed_at=$1 WHERE id=$2",[new Date().toISOString(),p.id]);
 }else if(action==='pair'){
  if(p.poll_type!=='pair')throw fail(400,'bad_action');
  if(isLocked('pair'))throw fail(403,'registration_locked');
  const partner=Number(body.partnerId);
  if(!Number.isSafeInteger(partner)||partner===user.id)throw fail(400,'bad_partner');
  const target=(await c.query('SELECT id,is_admin FROM cucac.users WHERE id=$1',[partner])).rows[0];
  if(!target||target.is_admin)throw fail(400,'bad_partner');
  const [one,two]=[user.id,partner].sort((a,b)=>a-b);
  if(rows.some(row=>row.member1===one&&row.member2===two))throw fail(409,'pair_exists');
  await c.query("INSERT INTO cucac.duet_entries(phase_id,member1,member2,proposed_by,part,audition_url,created_at) VALUES($1,$2,$3,$4,'pair',$5,$6)",[p.id,one,two,user.id,auditionUrl(body.auditionUrl),new Date().toISOString()]);
 }else if(action==='confirm'||action==='cancel'||action==='audition'){
  const entry=rows.find(row=>row.id===Number(body.entryId));
  if(!entry)throw fail(404,'entry_missing');
  if(!belongs(entry,user))throw fail(403,'forbidden');
  if(action==='audition'){
   await c.query('UPDATE cucac.duet_entries SET audition_url=$1 WHERE id=$2',[auditionUrl(body.auditionUrl),entry.id]);
  }else if(action==='confirm'){
   if(p.poll_type!=='pair'||entry.confirmed||entry.proposed_by===user.id)throw fail(403,'forbidden');
   if(isLocked('pair'))throw fail(403,'registration_locked');
   await c.query('UPDATE cucac.duet_entries SET confirmed=1 WHERE id=$1',[entry.id]);await append(entry.id);
  }else{
   const count=confirmed.filter(row=>row.part===entry.part).length;
   if(entry.confirmed&&p.started_at&&(isLocked(entry.part)||count<=3))throw fail(403,'withdraw_locked');
   await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(ballot) v WHERE (v->>\'candidateId\')::int=$2)',[p.id,entry.id]);
   await c.query('DELETE FROM cucac.duet_entries WHERE id=$1',[entry.id]);
  }
 }else if(action==='candidacy'){
  if(p.poll_type!=='parts')throw fail(400,'bad_action');
  const existing=confirmed.find(row=>row.member1===user.id&&(!body.part||row.part===body.part));
  if(body.join){
   if(!parts(p).includes(body.part))throw fail(400,'bad_part');
   if(confirmed.some(row=>row.member1===user.id&&row.part===body.part))throw fail(409,'already_in_part');
   if(isLocked(body.part))throw fail(403,'registration_locked');
   const inserted=(await c.query('INSERT INTO cucac.duet_entries(phase_id,member1,proposed_by,part,confirmed,audition_url,created_at) VALUES($1,$2,$2,$3,1,$4,$5) RETURNING id',[p.id,user.id,body.part,auditionUrl(body.auditionUrl),new Date().toISOString()])).rows[0];await append(inserted.id);
  }else if(existing){
   if(p.started_at&&(isLocked(existing.part)||confirmed.filter(row=>row.part===existing.part).length<=3))throw fail(403,'withdraw_locked');
   await c.query('DELETE FROM cucac.vote_submissions WHERE phase_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(ballot) v WHERE (v->>\'candidateId\')::int=$2)',[p.id,existing.id]);
   await c.query('DELETE FROM cucac.duet_entries WHERE id=$1',[existing.id]);
  }
 }else if(action==='vote'){
  if(!p.started_at)throw fail(403,'voting_not_started');
  const entry=confirmed.find(row=>row.id===Number(body.entryId));if(!entry)throw fail(400,'not_candidate');
  if(body.reaction==null){await c.query('DELETE FROM cucac.duet_votes WHERE phase_id=$1 AND entry_id=$2 AND voter_id=$3',[p.id,entry.id,user.id]);return;}
  if(body.reaction!=='like')throw fail(400,'bad_reaction');
  const count=(await c.query('SELECT count(*)::int AS n FROM cucac.duet_votes v JOIN cucac.duet_entries e ON e.id=v.entry_id WHERE v.phase_id=$1 AND v.voter_id=$2 AND e.part=$3 AND e.id<>$4',[p.id,user.id,entry.part,entry.id])).rows[0].n;
  if(count>=(isLocked(entry.part)?1:2))throw fail(400,'vote_limit');
  await c.query('INSERT INTO cucac.duet_votes(phase_id,entry_id,voter_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.id,entry.id,user.id]);
 }else throw fail(400,'bad_action');
}

export async function duetView(pool,p,user){
 const rows=(await pool.query(`SELECT e.*,u.name AS name1,u.full_name AS full1,u.avatar_ext AS avatar1,
  v.name AS name2,v.full_name AS full2,v.avatar_ext AS avatar2,
  (SELECT count(*)::int FROM cucac.duet_votes x WHERE x.phase_id=e.phase_id AND x.entry_id=e.id) AS likes,
  EXISTS(SELECT 1 FROM cucac.duet_votes x WHERE x.phase_id=e.phase_id AND x.entry_id=e.id AND x.voter_id=$2) AS mine
  FROM cucac.duet_entries e JOIN cucac.users u ON u.id=e.member1 LEFT JOIN cucac.users v ON v.id=e.member2 WHERE e.phase_id=$1 ORDER BY e.created_at,e.id`,[p.id,user.id])).rows;
 const view=row=>({id:row.id,name:[row.full1||row.name1,row.full2||row.name2].filter(Boolean).join(' + '),part:row.part,
  members:[{id:row.member1,name:row.full1||row.name1,avatar:row.avatar1?`/api/avatars/${row.member1}?v=${row.avatar1}`:''},...(row.member2?[{id:row.member2,name:row.full2||row.name2,avatar:row.avatar2?`/api/avatars/${row.member2}?v=${row.avatar2}`:''}]:[])],
  auditionUrl:row.audition_url,isMe:belongs(row,user)});
 let candidates=rows.filter(row=>row.confirmed).map(row=>({...view(row),mine:row.mine?'like':null,...(user.isAdmin?{likes:row.likes,again:0}:{})}));
 if(p.status==='closed'){
  candidates=[];
  for(const part of p.poll_type==='parts'?parts(p):['pair']){
   const all=rows.filter(row=>row.confirmed&&row.part===part).sort((a,b)=>b.likes-a.likes||a.id-b.id);
   let rank=0,last=null;
   for(const row of all){if(row.likes!==last){rank++;last=row.likes;}if(user.isAdmin||rank<=p.revealed_ranks)candidates.push({...view(row),rank,...(user.isAdmin?{likes:row.likes,again:0}:{})});}
  }
 }else{
  const order=JSON.parse(p.candidate_order);candidates.sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?1e9:ai)-(bi<0?1e9:bi);});
 }
 const locks=JSON.parse(p.part_locks||'{}');
 const confirmed=rows.filter(row=>row.confirmed);
 const candidateCounts=Object.fromEntries(['pair',...parts(p)].map(part=>[part,confirmed.filter(row=>row.part===part).length]));
 const ownEntries=p.status==='open'?candidates.filter(entry=>entry.isMe):[];
 if(p.status==='open'&&!p.started_at)candidates=[];
 return {candidateCount:p.poll_type==='parts'?new Set(confirmed.map(row=>row.member1)).size:confirmed.length,candidateCounts,ownEntries,pollType:p.poll_type,partA:p.part_a,partB:p.part_b,partC:p.part_c||'',partLabels:partLabels(p),partLocks:locks,candidates,
  pendingPairs:p.status==='open'?rows.filter(row=>!row.confirmed&&belongs(row,user)).map(row=>({...view(row),canConfirm:row.proposed_by!==user.id})):[],
  iAmCandidate:rows.some(row=>row.confirmed&&belongs(row,user)),
  voteLimits:p.poll_type==='parts'?Object.fromEntries(parts(p).map(part=>[part,locks[part]?1:2])):{pair:p.registration_locked?1:2}};
}
