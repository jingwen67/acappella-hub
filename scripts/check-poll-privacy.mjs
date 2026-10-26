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
 const users={};for(const who of ['creator','otherMd','voter'])users[who]=(await api('/api/register',who,{name:who,password:'test-password'},201)).user.id;
 await query('UPDATE cucac.users SET is_md=1 WHERE id IN ($1,$2)',[users.creator,users.otherMd]);
 // Simulate a live database from before the anonymity field existed.
 await query('ALTER TABLE cucac.phases DROP COLUMN is_anonymous');
 const old=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at) VALUES('Existing live poll','open',$1,'2026-10-25') RETURNING id",[users.creator])).rows[0];
 let state=await api('/api/state','admin');assert.equal(state.phase.anonymous,true);assert.equal(state.phase.canInspectVotes,false);await api(`/api/phases/${old.id}/ballots`,'admin',undefined,403);await api(`/api/phases/${old.id}/ballots`,'creator',undefined,403);
 await query("UPDATE cucac.phases SET status='closed' WHERE id=$1",[old.id]);
 for(const kind of ['solo','feedback','pair','parts','custom'])for(const anonymous of [undefined,true,false]){
  const body={title:'Privacy '+kind,pollType:['feedback','custom'].includes(kind)?kind==='feedback'?'solo':'custom':kind,votingMode:kind==='feedback'?'feedback':'default',entries:['A','B'],maxVotes:1,...(anonymous===undefined?{}:{anonymous})};
  const created=await api('/api/phases','creator',body,201),id=created.phase.id,expected=anonymous!==false;
  assert.equal(created.phase.anonymous,expected);assert.equal(created.phase.canSeeResults,!expected);if(kind==='custom')assert.ok(created.phase.candidates.every(c=>Object.hasOwn(c,'likes')===!expected));assert.equal(created.phase.canInspectVotes,!expected);assert.equal((await api('/api/state','admin')).phase.canInspectVotes,!expected);assert.equal((await api('/api/state','otherMd')).phase.canInspectVotes,false);
  const saved=(await query('SELECT is_anonymous FROM cucac.phases WHERE id=$1',[id])).rows[0];assert.equal(saved.is_anonymous,expected);
  for(const who of ['admin','creator'])await api(`/api/phases/${id}/ballots`,who,undefined,expected?403:200);
  for(const who of ['voter','otherMd'])await api(`/api/phases/${id}/ballots`,who,undefined,403);
  await api(`/api/phases/${id}/pending`,'creator');await api(`/api/phases/${id}/pending`,'admin');await api(`/api/phases/${id}/submitted`,'admin');await api(`/api/phases/${id}/submitted`,'creator');for(const who of ['otherMd','voter'])await api(`/api/phases/${id}/submitted`,who,undefined,403);
  await api(`/api/phases/${id}/edit`,'creator',{anonymous:!expected},400);assert.equal((await query('SELECT is_anonymous FROM cucac.phases WHERE id=$1',[id])).rows[0].is_anonymous,expected);
  await api(`/api/phases/${id}/close`,'creator',{});const history=(await api('/api/state','creator')).history[0];assert.equal(history.anonymous,expected);assert.equal(history.canInspectVotes,!expected);
  await api(`/api/phases/${id}/ballots`,'creator',undefined,expected?403:200);
 }
 assert.equal((await query('SELECT is_anonymous FROM cucac.phases WHERE id=$1',[old.id])).rows[0].is_anonymous,true);
 for(const anonymous of ['false',0,null])await api('/api/phases','creator',{title:'Invalid',anonymous},400);
 console.log('PASS: old ongoing polls default to anonymous before and after additive upgrade; all five methods persist anonymous defaults/explicit settings; anonymous ballots blocked for admin and creator, non-anonymous ballots restricted to them, pending lists independent, history privacy stable and no API to change anonymity after launch.');
}finally{await pg.close();}
