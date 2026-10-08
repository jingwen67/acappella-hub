import {VOICE_PARTS,readVoiceParts} from '../worker/voice-parts.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(v,max=100)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(400,'plan_invalid');return v.trim();};
const manager=u=>Boolean(u.isMd||u.isAdmin);
const chooser=u=>Boolean(manager(u)||u.isPresident);
const requireChooser=u=>{if(!chooser(u))throw fail(403,'forbidden');};
const requireManager=u=>{if(!manager(u))throw fail(403,'forbidden');};
function folder(v){if(!v)return '';let url;try{url=new URL(v);}catch{throw fail(400,'plan_folder');}if(url.protocol!=='https:'||url.hostname!=='drive.google.com'||!/^\/drive\/(?:u\/\d+\/)?folders\/[\w-]+\/?$/.test(url.pathname))throw fail(400,'plan_folder');return url.href;}
export function createPlans(pool){
 const term=async(q,id,lock=false)=>{const t=(await q.query('SELECT * FROM cucac.plan_terms WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!t)throw fail(404,'plan_missing');return t;};
 async function roster(q,id){
  const users=(await q.query('SELECT id,name,full_name,voice_part,is_alumni,is_crew FROM cucac.users WHERE is_admin=0')).rows;
  const entries=(await q.query('SELECT e.* FROM cucac.plan_entries e JOIN cucac.plan_songs s ON s.id=e.song_id WHERE s.term_id=$1 AND NOT s.excluded',[id])).rows;
  const included=new Set(entries.map(e=>e.member_key));
  const members=users.filter(u=>(!u.is_alumni&&!u.is_crew)||included.has(u.id)).map(u=>({id:u.id,name:u.full_name||u.name,voiceParts:readVoiceParts(u.voice_part)}));
  for(const e of entries)if(!members.some(m=>m.id===e.member_key))members.push({id:e.member_key,name:e.member_name,voiceParts:[e.part],former:true});
  return members;
 }
 async function list(user,id,q=pool){const terms=(await q.query('SELECT id,label,archived FROM cucac.plan_terms ORDER BY archived,created_at DESC,id DESC')).rows;
  if(!terms.length)return {terms:[],term:null,songs:[],members:[],canManage:manager(user),canChoose:chooser(user)};
  const t=await term(q,id||terms[0].id);const songs=(await q.query('SELECT * FROM cucac.plan_songs WHERE term_id=$1 AND NOT excluded ORDER BY id',[t.id])).rows;
  const entries=(await q.query('SELECT e.* FROM cucac.plan_entries e JOIN cucac.plan_songs s ON s.id=e.song_id WHERE s.term_id=$1 AND NOT s.excluded',[t.id])).rows;
  return {terms,term:{id:t.id,label:t.label,archived:t.archived},canManage:manager(user),canChoose:chooser(user),sheetPending:chooser(user)?Number((await q.query('SELECT count(*)::int AS n FROM cucac.plan_sheet_jobs WHERE semester=$1 AND NOT synced',[t.label])).rows[0].n):0,members:t.archived?t.roster_snapshot||[]:await roster(q,t.id),songs:songs.map(s=>({id:s.id,title:s.title,folderUrl:s.folder_url,locked:s.locked,entries:entries.filter(e=>e.song_id===s.id).map(e=>({memberId:e.member_key,name:e.member_name,part:e.part}))}))};
 }
 async function fromSemester(user,label,folders){
  label=text(label,40);const c=await pool.connect();let id;try{await c.query('BEGIN');
   // Folder discovery happens before the transaction; the semester row serializes changes.
   let t=(await c.query("SELECT * FROM cucac.plan_terms WHERE lower(regexp_replace(label,'\\s','','g'))=lower(regexp_replace($1,'\\s','','g')) FOR UPDATE",[label])).rows[0];
   if(!t){await c.query('INSERT INTO cucac.plan_terms(label) VALUES($1) ON CONFLICT (lower(label)) DO NOTHING',[label]);t=(await c.query('SELECT * FROM cucac.plan_terms WHERE lower(label)=lower($1) FOR UPDATE',[label])).rows[0];}id=t.id;
   if(!t?.archived)for(const song of folders){const title=text(String(song.name||'').slice(0,100)),url=folder(song.url);if(!url)continue;
    const existing=(await c.query('SELECT id FROM cucac.plan_songs WHERE term_id=$1 AND folder_url=$2',[id,url])).rows[0];
    if(!existing){await c.query('INSERT INTO cucac.plan_songs(term_id,title,folder_url) VALUES($1,$2,$3)',[id,title,url]);await queue(c,url,t?.label||label,title);}
   }
   await c.query('COMMIT');return await list(user,id,c);
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async function queue(q,url,label,title,fromLibrary=false){if(!url&&!fromLibrary)return;const folderId=url?new URL(url).pathname.split('/').filter(Boolean).at(-1):'title:'+title.trim().toLowerCase();await q.query('INSERT INTO cucac.plan_sheet_jobs(folder_id,semester,title) VALUES($1,$2,$3) ON CONFLICT(folder_id,semester) DO NOTHING',[folderId,label,title]);}
 async function sync(update){const c=await pool.connect();try{await c.query('BEGIN');const gate=(await c.query('SELECT id FROM cucac.plan_sheet_jobs WHERE id=(SELECT min(id) FROM cucac.plan_sheet_jobs) FOR UPDATE SKIP LOCKED')).rows;if(!gate.length){await c.query('COMMIT');return;}
  const jobs=(await c.query(`SELECT * FROM cucac.plan_sheet_jobs WHERE NOT synced ORDER BY (last_error='') DESC,id LIMIT 300`)).rows;
  if(jobs.length){try{const completed=new Set(await update(jobs));for(const job of jobs)await c.query('UPDATE cucac.plan_sheet_jobs SET synced=$1,last_error=$2 WHERE id=$3',[completed.has(job.id),completed.has(job.id)?'':'sheet_song_missing',job.id]);}catch(error){await c.query('UPDATE cucac.plan_sheet_jobs SET last_error=$1 WHERE id=ANY($2::int[])',[String(error.message).slice(0,100),jobs.map(j=>j.id)]);}}
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 async function mutate(user,action,id,body){const c=await pool.connect();let termId;try{await c.query('BEGIN');
  if(action==='term'){requireManager(user);const label=text(body.label,40);const exists=(await c.query('SELECT id FROM cucac.plan_terms WHERE lower(label)=lower($1)',[label])).rows[0];if(exists)throw fail(409,'plan_exists');termId=(await c.query('INSERT INTO cucac.plan_terms(label) VALUES($1) RETURNING id',[label])).rows[0].id;
  }else if(action==='archive'){requireManager(user);const t=await term(c,id,true);termId=t.id;if(typeof body.archived!=='boolean')throw fail(400,'plan_invalid');await c.query('UPDATE cucac.plan_terms SET archived=$1,roster_snapshot=$2::jsonb WHERE id=$3',[body.archived,body.archived?JSON.stringify(await roster(c,id)):null,id]);
  }else if(action==='add'||action==='bulk'){requireChooser(user);const t=await term(c,id,true);termId=t.id;if(t.archived)throw fail(409,'plan_archived');const songs=action==='add'?[body]:body.songs;if(!Array.isArray(songs)||!songs.length||songs.length>300)throw fail(400,'plan_invalid');
   for(const song of songs){const title=text(song.title),url=folder(song.folderUrl);const existing=(await c.query(`SELECT id FROM cucac.plan_songs WHERE term_id=$1 AND ((folder_url=$2 AND $2<>'') OR (lower(title)=lower($3) AND folder_url=$2))`,[id,url,title])).rows[0];if(existing)await c.query('UPDATE cucac.plan_songs SET excluded=false WHERE id=$1',[existing.id]);else await c.query('INSERT INTO cucac.plan_songs(term_id,title,folder_url) VALUES($1,$2,$3)',[id,title,url]);await queue(c,url,t.label,title,action==='bulk');}
  }else{
   const s=(await c.query('SELECT * FROM cucac.plan_songs WHERE id=$1',[id])).rows[0];if(!s)throw fail(404,'plan_missing');const t=await term(c,s.term_id,true);termId=t.id;if(t.archived)throw fail(409,'plan_archived');
   // All mutations for a term share its lock, including signup, confirmation and archival.
   const current=(await c.query('SELECT * FROM cucac.plan_songs WHERE id=$1',[id])).rows[0];if(!current)throw fail(404,'plan_missing');
   if(action==='edit'){requireManager(user);if(typeof body.locked!=='boolean')throw fail(400,'plan_invalid');await c.query('UPDATE cucac.plan_songs SET title=$1,folder_url=$2,locked=$3 WHERE id=$4',[text(body.title),folder(body.folderUrl),body.locked,id]);await queue(c,folder(body.folderUrl),t.label,text(body.title));
   }else if(action==='delete'){requireChooser(user);await c.query('UPDATE cucac.plan_songs SET excluded=true WHERE id=$1',[id]);
   }else if(action==='entry'){
    if(current.excluded)throw fail(404,'plan_missing');
    const memberId=body.memberId===undefined?user.id:Number(body.memberId);if(!Number.isInteger(memberId))throw fail(400,'plan_invalid');if(memberId!==user.id)requireManager(user);if(current.locked&&!manager(user))throw fail(409,'plan_locked');
    if(body.part===null){await c.query('DELETE FROM cucac.plan_entries WHERE song_id=$1 AND member_key=$2',[id,memberId]);}
    else {if(!VOICE_PARTS.includes(body.part))throw fail(400,'voice_parts_invalid');const m=(await c.query('SELECT * FROM cucac.users WHERE id=$1 AND is_admin=0',[memberId])).rows[0];if(!m)throw fail(404,'user_missing');if(!manager(user)&&(m.is_crew||m.is_alumni))throw fail(403,'plan_active_only');await c.query('INSERT INTO cucac.plan_entries(song_id,member_key,member_id,member_name,part) VALUES($1,$2,$2,$3,$4) ON CONFLICT(song_id,member_key) DO UPDATE SET part=excluded.part,member_name=excluded.member_name',[id,memberId,m.full_name||m.name,body.part]);}
   }else throw fail(400,'bad_action');
  }
  await c.query('COMMIT');return await list(user,termId,c);
 }catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw fail(409,'plan_exists');throw e;}finally{c.release();}}
 return {list,mutate,sync,fromSemester};
}
