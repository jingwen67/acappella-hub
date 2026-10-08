import {randomUUID} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const MAX_AUDIO_BYTES=50*1024*1024;
const types={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac'};
const expired=p=>p.status==='closed'&&Date.parse(p.closed_at)+7*86400000<=Date.now();
export function createRecordings(pool,files){
 async function phase(id){const p=(await pool.query('SELECT * FROM cucac.phases WHERE id=$1',[id])).rows[0];if(!p)throw fail(404,'phase_missing');return p;}
 async function owned(p,candidate,entry,user){
  if(p.poll_type==='solo'){
   if(Number(candidate)!==user.id||entry)throw fail(403,'forbidden');
   if(!(await pool.query('SELECT 1 FROM cucac.candidacies WHERE phase_id=$1 AND user_id=$2',[p.id,user.id])).rows.length)throw fail(400,'not_candidate');
  }else{
   const e=(await pool.query('SELECT * FROM cucac.duet_entries WHERE phase_id=$1 AND id=$2 AND confirmed=1',[p.id,Number(entry)])).rows[0];
   if(!e||candidate||![e.member1,e.member2].includes(user.id))throw fail(403,'forbidden');
  }
 }
 async function row(id){const r=(await pool.query('SELECT * FROM cucac.recordings WHERE id=$1',[id])).rows[0];if(!r)throw fail(404,'recording_missing');return r;}
 async function begin(id,user,body){
  const p=await phase(id);if(p.status!=='open')throw fail(400,'phase_closed');await owned(p,body.candidateId,body.entryId,user);
  const mime=String(body.mime||'').split(';')[0].trim().toLowerCase();if(!types[mime])throw fail(400,'audio_type');
  if(!Number.isSafeInteger(body.size)||body.size<=0||body.size>MAX_AUDIO_BYTES)throw fail(413,'audio_size');
  const uid=randomUUID(),key='recordings/'+uid+'.'+types[mime];
  await pool.query('INSERT INTO cucac.recordings(id,phase_id,candidate_id,entry_id,uploaded_by,object_key,mime) VALUES($1,$2,$3,$4,$5,$6,$7)',[uid,p.id,p.poll_type==='solo'?user.id:null,p.poll_type==='solo'?null:Number(body.entryId),user.id,key,mime]);
  try{return {id:uid,signedUrl:await files.audioUploadUrl(key),maxBytes:MAX_AUDIO_BYTES};}catch(e){await pool.query('DELETE FROM cucac.recordings WHERE id=$1',[uid]);throw e;}
 }
 async function complete(id,user){
  const r=await row(id);if(r.uploaded_by!==user.id)throw fail(403,'forbidden');const p=await phase(r.phase_id);if(p.status!=='open')throw fail(400,'phase_closed');await owned(p,r.candidate_id,r.entry_id,user);
  const info=await files.audioInfo(r.object_key);const size=Number(info.size??info.metadata?.size),mime=String(info.contentType??info.mimetype??info.metadata?.mimetype??'').split(';')[0].toLowerCase();
  if(!size||size>MAX_AUDIO_BYTES||!types[mime]){await files.delete(r.object_key);await pool.query('DELETE FROM cucac.recordings WHERE id=$1',[r.id]);throw fail(400,'audio_type');}
  await pool.query("UPDATE cucac.recordings SET status='ready',size=$1,mime=$2 WHERE id=$3",[size,mime,r.id]);return p.id;
 }
 async function play(id){const r=await row(id);if(r.status!=='ready'||!r.phase_id||(!r.candidate_id&&!r.entry_id))throw fail(404,'recording_missing');const p=await phase(r.phase_id);if(expired(p))throw fail(410,'recording_expired');
  const remaining=p.status==='closed'?Math.floor((Date.parse(p.closed_at)+7*86400000-Date.now())/1000):3600;
  return files.audioPlaybackUrl(r.object_key,Math.max(1,Math.min(3600,remaining)));
 }
 async function remove(id,user){const r=await row(id);const p=await phase(r.phase_id);await owned(p,r.candidate_id,r.entry_id,user);await files.delete(r.object_key);await pool.query('DELETE FROM cucac.recordings WHERE id=$1',[id]);return p.id;}
 async function list(id,user){const p=await phase(id);if(expired(p))return [];
  const rows=(await pool.query(`SELECT r.*,u.name AS solo_name,u.full_name AS solo_full,e.member1,e.member2,
   a.name AS name1,a.full_name AS full1,b.name AS name2,b.full_name AS full2
   FROM cucac.recordings r LEFT JOIN cucac.users u ON u.id=r.candidate_id LEFT JOIN cucac.duet_entries e ON e.id=r.entry_id
   LEFT JOIN cucac.users a ON a.id=e.member1 LEFT JOIN cucac.users b ON b.id=e.member2
   WHERE r.phase_id=$1 AND r.status='ready' AND (r.candidate_id IS NOT NULL OR e.id IS NOT NULL) ORDER BY r.created_at`,[id])).rows;
  return rows.map(r=>({id:r.id,url:'/api/recordings/'+r.id,name:r.solo_full||r.solo_name||[r.full1||r.name1,r.full2||r.name2].filter(Boolean).join(' + '),candidateId:r.candidate_id,entryId:r.entry_id,
   canDelete:r.candidate_id===user.id||r.member1===user.id||r.member2===user.id,createdAt:r.created_at}));
 }
 // Public maintenance can only remove server-determined expired/orphaned uploads; it accepts no target IDs.
 async function cleanup(){const c=await pool.connect();let deleted=0;try{await c.query('BEGIN');
  const rows=(await c.query(`SELECT r.* FROM cucac.recordings r LEFT JOIN cucac.phases p ON p.id=r.phase_id
   WHERE (p.status='closed' AND p.closed_at::timestamptz<=now()-interval '7 days')
   OR (r.created_at<now()-interval '1 day' AND (r.status='pending' OR r.phase_id IS NULL OR (r.candidate_id IS NULL AND r.entry_id IS NULL)))
   ORDER BY r.created_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED`)).rows;
  for(let i=0;i<rows.length;i+=10){const results=await Promise.allSettled(rows.slice(i,i+10).map(async r=>{await files.delete(r.object_key);await c.query('DELETE FROM cucac.recordings WHERE id=$1',[r.id]);deleted++;}));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
  await c.query('COMMIT');return deleted;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {begin,complete,play,remove,list,cleanup};
}
