import {createRecordings} from '../vercel/recordings.js';
import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {createDatabase} from '../vercel/database.js';import {createVoting} from '../vercel/voting.js';import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0};if(sql.includes("CREATE TABLE IF NOT EXISTS cucac.custom_votes")){await pg.exec(sql);return {rows:[],rowCount:0};}const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})},files=new Map();
const env={DB:createDatabase(pool),FILES:{get:async()=>null,put:async()=>{}},ADMIN_PASSWORD:'test-admin-password',PUBLIC_ORIGIN:'https://hub.test',voting:createVoting(pool)};
const cookies={};
async function api(path,who='',body,status=200){const res=await worker.fetch(new Request('https://hub.test'+path,{method:body===undefined?'GET':'POST',headers:{...(who&&cookies[who]?{Cookie:cookies[who]}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));if(res.headers.get('set-cookie'))cookies[who]=res.headers.get('set-cookie').split(';')[0];return data;}

try{
 await api('/api/login','admin',{name:'admin',password:env.ADMIN_PASSWORD});
 const users={};for(const who of ['creator','voter','outsider'])users[who]=(await api('/api/register',who,{name:who,password:'test-password'},201)).user.id;await query('UPDATE cucac.users SET is_md=1 WHERE id=$1',[users.creator]);
 await query("CREATE UNIQUE INDEX one_open_phase ON cucac.phases(status) WHERE status='open'");
 const a=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at,started_at,registration_locked,is_anonymous) VALUES('Existing solo','open',$1,'2026-10-26','2026-10-26',1,false) RETURNING id",[users.creator])).rows[0].id;
 for(const id of [users.creator,users.voter])await query("INSERT INTO cucac.candidacies VALUES($1,$2,'2026-10-26')",[a,id]);
 await api(`/api/phases/${a}/enter`,'voter',{});await api(`/api/phases/${a}/vote`,'voter',{candidateId:users.creator,reaction:'like'});await api(`/api/phases/${a}/submit`,'voter',{votes:[{candidateId:users.creator,reaction:'like'}]});
 const b=(await api('/api/phases','creator',{pollType:'custom',title:'Concurrent custom',entries:['One','Two','Three'],maxVotes:2,anonymous:true},201)).phase.id;
 assert.equal((await query("SELECT to_regclass('cucac.one_open_phase') AS name")).rows[0].name,null);
 const c=(await api('/api/phases','creator',{pollType:'pair',title:'Concurrent duet',anonymous:false},201)).phase.id;
 const all=await api('/api/state','creator');assert.equal(all.phase.id,c);assert.deepEqual(all.activeRounds.map(p=>p.id),[c,b,a]);
 let state=await api('/api/state?phaseId='+a,'voter');assert.equal(state.phase.id,a);assert.equal(state.phase.submittedBallot.votes[0].candidateId,users.creator);assert.equal(state.phase.candidates.find(p=>p.id===users.creator).mine,'like');
 state=await api('/api/state?phaseId='+b,'voter');assert.equal(state.phase.id,b);assert.equal(state.phase.participating,false);assert.equal(state.phase.candidates.length,0);assert.ok(state.activeRounds.every(p=>!Object.hasOwn(p,'candidates')));
 await api(`/api/phases/${b}/enter`,'voter',{});state=await api(`/api/phases/${b}/vote`,'voter',{candidateId:1,reaction:'like'});assert.equal(state.phase.id,b);assert.equal(state.phase.submittedBallot,null);await api(`/api/phases/${b}/submit`,'voter',{votes:[{candidateId:1,reaction:'like'}]});
 state=await api('/api/state?phaseId='+a,'voter');assert.equal(state.phase.submittedBallot.votes[0].candidateId,users.creator);assert.equal(state.phase.id,a);
 await api(`/api/phases/${b}/vote`,'voter',{candidateId:2,reaction:'like'});assert.equal((await api('/api/state?phaseId='+a,'voter')).phase.submittedBallot.votes.length,1);assert.equal((await api('/api/state?phaseId='+b,'voter')).phase.submittedBallot,null);
 env.recordings=createRecordings(pool,{audioUploadUrl:async()=>'/upload',audioInfo:async()=>({size:32,contentType:'audio/webm'}),audioPlaybackUrl:async()=>'/play',delete:async()=>{}});const recording=await api(`/api/phases/${a}/recordings`,'voter',{candidateId:users.voter,size:32,mime:'audio/webm'},201);const recorded=await api(`/api/recordings/${recording.id}/complete`,'voter',{});assert.equal(recorded.phase.id,a);assert.equal(recorded.phase.recordings.length,1);assert.equal((await api('/api/state?phaseId='+b,'voter')).phase.recordings.length,0);await api(`/api/phases/${b}/recordings`,'voter',{candidateId:users.voter,size:32,mime:'audio/webm'},400);
 const before=(await query('SELECT * FROM cucac.votes WHERE phase_id=$1',[a])).rows;
 state=await api(`/api/phases/${b}/close`,'creator',{});assert.deepEqual(state.activeRounds.map(p=>p.id),[c,a]);assert.ok(state.history.some(p=>p.id===b));assert.equal((await api('/api/state?phaseId='+a,'creator')).phase.status,'open');assert.deepEqual((await query('SELECT * FROM cucac.votes WHERE phase_id=$1',[a])).rows,before);
 await api(`/api/phases/${c}/delete`,'admin',{});state=await api('/api/state?phaseId='+c,'voter');assert.equal(state.phase.id,a);assert.equal(state.phase.submittedBallot.votes.length,1);
 await api('/api/phases','voter',{title:'Not allowed'},403);
 console.log('PASS: safely removes existing singleton index; simultaneous Solo/custom/Duet rounds; explicit/default selection; hidden pre-entry candidates; per-round choices, receipts and submissions; closing/deleting one preserves others and existing ballots; stale selection fallback and creation permissions.');
}finally{await pg.close();}
