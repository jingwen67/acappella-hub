import {updateRequestedCurrentPoll,requestedPollCutoff} from '../vercel/current-poll-update.js';
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
 const creator=(await api('/api/register','creator',{name:'creator',password:'test-password'},201)).user.id;const voter=(await api('/api/register','voter',{name:'voter',password:'test-password'},201)).user.id;
 await query('UPDATE cucac.users SET is_md=1 WHERE id=$1',[creator]);
 const p=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at,started_at) VALUES('Current','open',$1,'2026-10-25T00:00:00Z','2026-10-25T00:00:00Z') RETURNING id",[creator])).rows[0];
 await query("INSERT INTO cucac.candidacies VALUES($1,$2,'2026-10-25T00:00:00Z')",[p.id,creator]);await query("INSERT INTO cucac.votes(phase_id,voter_id,candidate_id,reaction) VALUES($1,$2,$3,'like')",[p.id,voter,creator]);await api(`/api/phases/${p.id}/enter`,'voter',{});
 const before=(await query('SELECT * FROM cucac.votes WHERE phase_id=$1',[p.id])).rows;
 let state=await api('/api/state','admin');assert.equal(state.phase.canSeeResults,true);assert.equal(state.phase.candidates[0].likes,1);assert.equal(state.phase.anonymous,true);await api(`/api/phases/${p.id}/ballots`,'admin',undefined,403);
 assert.deepEqual(await updateRequestedCurrentPoll(pool,'new-club'),[]);assert.equal((await query('SELECT is_anonymous FROM cucac.phases WHERE id=$1',[p.id])).rows[0].is_anonymous,true);
 assert.deepEqual(await updateRequestedCurrentPoll(pool,'cucac'),[{id:p.id}]);assert.deepEqual(await updateRequestedCurrentPoll(pool,'cucac'),[]);
 state=await api('/api/state','admin');assert.equal(state.phase.anonymous,false);assert.equal(state.phase.canInspectVotes,true);assert.equal(state.phase.status,'open');assert.equal((await api(`/api/phases/${p.id}/ballots`,'admin')).members.find(m=>m.id===voter).choices[0].name,'creator');assert.deepEqual((await query('SELECT * FROM cucac.votes WHERE phase_id=$1',[p.id])).rows,before);
 const normal=(await api('/api/state','voter')).phase;assert.equal(normal.canSeeResults,false);assert.ok(normal.candidates.every(c=>!Object.hasOwn(c,'likes')));
 await query("UPDATE cucac.phases SET status='closed' WHERE id=$1",[p.id]);
 const newer=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at) VALUES('Future anonymous','open',$1,$2) RETURNING id",[creator,new Date(Date.parse(requestedPollCutoff)+1000).toISOString()])).rows[0];assert.deepEqual(await updateRequestedCurrentPoll(pool,'cucac'),[]);assert.equal((await query('SELECT is_anonymous FROM cucac.phases WHERE id=$1',[newer.id])).rows[0].is_anonymous,true);
 console.log('PASS: live totals visible only to admin for anonymous polls; named poll inspection retains voter mappings; one-time CUCAC current-round conversion is idempotent, preserves votes/open status, skips Reborn, closed rounds and all future anonymous rounds.');
}finally{await pg.close();}
