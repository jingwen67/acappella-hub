import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {createDatabase} from '../vercel/database.js';import {createVoting} from '../vercel/voting.js';import {customPollSchema} from '../vercel/custom-polls.js';import {createRecordings} from '../vercel/recordings.js';import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0};if(sql.includes("CREATE TABLE IF NOT EXISTS cucac.custom_votes")){await pg.exec(sql);return {rows:[],rowCount:0};}const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})},files=new Map();
const env={DB:createDatabase(pool),FILES:{get:async()=>null,put:async()=>{}},ADMIN_PASSWORD:'test-admin-password',PUBLIC_ORIGIN:'https://hub.test',voting:createVoting(pool)};
const cookies={};
async function api(path,who='',body,status=200){const res=await worker.fetch(new Request('https://hub.test'+path,{method:body===undefined?'GET':'POST',headers:{...(who&&cookies[who]?{Cookie:cookies[who]}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));if(res.headers.get('set-cookie'))cookies[who]=res.headers.get('set-cookie').split(';')[0];return data;}

try{
 await pg.exec(customPollSchema);
 await api('/api/login','admin',{name:'admin',password:env.ADMIN_PASSWORD});
 const people={};for(const who of ['creator','otherMd','voter','absent'])people[who]=(await api('/api/register',who,{name:who,password:'test-password'},201)).user.id;
 await query('UPDATE cucac.users SET is_md=1 WHERE id IN ($1,$2)',[people.creator,people.otherMd]);
 for(const kind of ['solo','feedback','pair','parts','custom']){
  const p=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at,started_at,voting_mode,poll_type,part_a,part_b,part_labels,is_anonymous) VALUES($1,'open',$2,'2026-10-25','2026-10-25',$3,$4,$5,$6,$7::jsonb,false) RETURNING id",[kind,people.creator,kind==='feedback'?'feedback':'default',['custom','feedback'].includes(kind)?'solo':kind,kind==='custom'?'__custom_poll_v1__':'High',kind==='custom'?'2':'Low',JSON.stringify(kind==='custom'?['Option A','Option B']:['High','Low'])])).rows[0];
  for(const who of ['creator','voter'])await api(`/api/phases/${p.id}/enter`,who,{});
  if(kind==='custom')await query('INSERT INTO cucac.custom_votes VALUES($1,$2,1)',[p.id,people.voter]);
  else if(['solo','feedback'].includes(kind)){
   await query("INSERT INTO cucac.candidacies VALUES($1,$2,'2026-10-25')",[p.id,people.creator]);
   await query('INSERT INTO cucac.votes(phase_id,voter_id,candidate_id,reaction) VALUES($1,$2,$3,$4)',[p.id,people.voter,people.creator,kind==='feedback'?'again':'like']);
  }else{
   const entry=(await query("INSERT INTO cucac.duet_entries(phase_id,member1,member2,proposed_by,part,confirmed,created_at) VALUES($1,$2,$3,$2,$4,1,'2026-10-25') RETURNING id",[p.id,people.creator,kind==='pair'?people.otherMd:null,kind==='pair'?'pair':'A'])).rows[0];
   await query('INSERT INTO cucac.duet_votes VALUES($1,$2,$3)',[p.id,entry.id,people.voter]);
  }
  const audit=await api(`/api/phases/${p.id}/ballots`,'admin');const ballot=audit.members.find(m=>m.id===people.voter);assert.equal(ballot.choices.length,1);assert.equal(ballot.submitted,false);assert.equal(ballot.choices[0].reaction,kind==='feedback'?'again':'like');assert.ok(ballot.choices[0].name.includes(kind==='custom'?'Option A':'creator'));if(kind==='parts')assert.equal(ballot.choices[0].part,'High');
  await api(`/api/phases/${p.id}/ballots`,'creator');for(const who of ['otherMd','voter'])await api(`/api/phases/${p.id}/ballots`,who,undefined,403);
  await api(`/api/phases/${p.id}/pending`,'voter',undefined,403);await api(`/api/phases/${p.id}/pending`,'otherMd',undefined,403);
  let pending=await api(`/api/phases/${p.id}/pending`,'creator');assert.deepEqual(pending.members.map(m=>m.name),['creator','voter']);assert.ok(!pending.members.some(m=>m.id===people.absent));
  await query("INSERT INTO cucac.vote_submissions(phase_id,voter_id,ballot) VALUES($1,$2,'[]'::jsonb)",[p.id,people.creator]);pending=await api(`/api/phases/${p.id}/pending`,'admin');assert.deepEqual(pending.members.map(m=>m.name),['voter']);const finished=await api(`/api/phases/${p.id}/submitted`,'creator');assert.deepEqual(finished.members,[{id:people.creator,name:'creator'}]);await api(`/api/phases/${p.id}/submitted`,'admin');for(const who of ['otherMd','voter'])await api(`/api/phases/${p.id}/submitted`,who,undefined,403);
  const creatorState=await api('/api/state','creator');assert.equal(creatorState.phase.canSeeResults,true);assert.ok(creatorState.phase.candidates.some(c=>c.likes+c.again===1),kind+' creator totals');const otherState=await api('/api/state','otherMd');assert.equal(otherState.phase.canSeeResults,false);assert.ok(otherState.phase.candidates.every(c=>!Object.hasOwn(c,'likes')));const normal=await api('/api/state','voter');assert.equal(normal.phase.canInspectVotes,false);assert.equal(normal.phase.canSeePending,false);assert.equal(JSON.stringify(normal).includes('choices'),false);
  await api(`/api/phases/${p.id}/close`,'creator',{});
  for(const who of ['admin','otherMd','voter']){assert.equal((await api('/api/state',who)).history[0].canReveal,false);await api(`/api/phases/${p.id}/reveal`,who,{},403);}
  assert.equal((await api('/api/state','creator')).history[0].canReveal,true);await api(`/api/phases/${p.id}/reveal`,'creator',{});
  assert.equal((await api(`/api/phases/${p.id}/ballots`,'admin')).members.find(m=>m.id===people.voter).choices.length,1);
 }
 env.recordings=createRecordings(pool,{audioUploadUrl:async()=>'/upload',audioInfo:async()=>({size:32,contentType:'audio/webm'}),audioPlaybackUrl:async()=>'/play',delete:async()=>{}});
 const created=await api('/api/phases','creator',{title:'Record before voting',pollType:'solo'},201),id=created.phase.id;
 for(const who of ['creator','voter']){await api(`/api/phases/${id}/enter`,who,{});await api(`/api/phases/${id}/candidacy`,who,{join:true});}
 const upload=await api(`/api/phases/${id}/recordings`,'voter',{candidateId:people.voter,size:32,mime:'audio/webm'},201);await api(`/api/recordings/${upload.id}/complete`,'voter',{});
 assert.equal((await api('/api/state','voter')).phase.recordings.length,1);assert.equal((await api('/api/state','creator')).phase.recordings.length,0);
 await api(`/api/recordings/${upload.id}`,'creator',undefined,403);
 await api(`/api/phases/${id}/start`,'creator',{});assert.equal((await api('/api/state','creator')).phase.recordings.length,1);
 console.log('PASS: existing ballots readable across all five methods; private audits reject members/other MDs; pending lists only checked-in unsubmitted participants and exclude submitted abstentions; creator-only reveal enforced server/UI; Solo pre-start upload/playback ownership and post-start sharing.');
}finally{await pg.close();}
