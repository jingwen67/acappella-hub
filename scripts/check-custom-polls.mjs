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
 const md=await api('/api/register','md',{name:'MD',password:'test-password'},201);const voter=await api('/api/register','voter',{name:'Voter',password:'test-password'},201);const second=await api('/api/register','second',{name:'Second',password:'test-password'},201);
 await query('UPDATE cucac.users SET is_md=1 WHERE id=$1',[md.user.id]);
 const body={pollType:'custom',title:'Choose songs',entries:['Song A','Song B','Song C','Song D'],maxVotes:2};
 await api('/api/phases','voter',body,403);
 for(const extra of [{entries:['One']},{entries:['Same',' same ']},{maxVotes:0},{maxVotes:5},{maxVotes:1.5},{entries:['a','x'.repeat(121)]}])await api('/api/phases','md',{...body,...extra},400);
 const created=await api('/api/phases','md',body,201),id=created.phase.id;assert.equal(created.phase.pollType,'custom');assert.equal(created.phase.voteLimit,2);assert.equal(created.phase.started,true);assert.equal(created.phase.candidates.length,4);assert.ok(created.phase.participating);
 await api('/api/phases','md',body,409);
 const before=await api('/api/state','voter');assert.equal(before.phase.candidates.length,0);assert.equal(before.phase.pollType,'custom');
 await api(`/api/phases/${id}/vote`,'voter',{candidateId:1,reaction:'like'},403);
 await api(`/api/phases/${id}/enter`,'voter',{});await api(`/api/phases/${id}/enter`,'second',{});
 const vote=async(who,idValue,reaction='like',status=200)=>api(`/api/phases/${id}/vote`,who,{candidateId:idValue,reaction},status);
 await vote('voter',1);await vote('voter',1);await vote('voter',2);await vote('voter',3,'like',400);await vote('voter',99,'like',400);await vote('voter',1,'again',400);
 let state=await api('/api/state','voter');assert.equal(state.phase.candidates.filter(c=>c.mine).length,2);assert.ok(state.phase.candidates.every(c=>!Object.hasOwn(c,'likes')));
 await api(`/api/phases/${id}/submit`,'voter',{votes:[{candidateId:1,reaction:'like'}]},409);
 const votes=[{candidateId:1,reaction:'like'},{candidateId:2,reaction:'like'}];let submitted=await api(`/api/phases/${id}/submit`,'voter',{votes});assert.deepEqual(submitted.voteReceipt.votes.map(v=>v.name),['Song A','Song B']);
 await api(`/api/phases/${id}/submit`,'second',{votes:[]});state=await api('/api/state','md');assert.equal(state.phase.voteProgress.submitted,2);assert.equal(state.phase.voteProgress.total,3);
 await vote('voter',2,null);assert.equal((await api('/api/state','voter')).phase.submittedBallot,null);await vote('voter',3);await vote('second',1);await vote('second',4);
 await api(`/api/phases/${id}/candidacy`,'voter',{join:true},400);await api(`/api/phases/${id}/close`,'voter',{},403);
 await api(`/api/phases/${id}/close`,'md',{});const history=(await api('/api/state','voter')).history[0];assert.equal(history.pollType,'custom');assert.deepEqual(history.candidates.map(c=>[c.name,c.rank]),[['Song A',1],['Song C',2],['Song D',2]]);assert.ok(history.candidates.every(c=>!Object.hasOwn(c,'likes')));
 const admin=(await api('/api/state','admin')).history[0];assert.equal(admin.candidates.length,4);assert.equal(admin.candidates.find(c=>c.name==='Song B').likes,0);assert.equal(admin.pollType,'custom');
 await api(`/api/phases/${id}/reveal`,'admin',{},403);await api(`/api/phases/${id}/reveal`,'md',{});assert.equal((await api('/api/state','voter')).history[0].candidates.length,4);
 await vote('voter',1,'like',400);
 await query('DELETE FROM cucac.sessions WHERE user_id=$1',[second.user.id]);await query('DELETE FROM cucac.vote_submissions WHERE voter_id=$1',[second.user.id]);await query('DELETE FROM cucac.vote_presence WHERE user_id=$1',[second.user.id]);await query('DELETE FROM cucac.users WHERE id=$1',[second.user.id]);assert.equal((await api('/api/state','admin')).history[0].candidates.find(c=>c.id===1).likes,2);
 await api(`/api/phases/${id}/delete`,'admin',{});assert.equal((await query('SELECT count(*)::int AS n FROM cucac.custom_votes')).rows[0].n,0);
 console.log('PASS: custom creation validation and authorization, fixed options/caps, enter gating, duplicate votes, persisted ballots/abstention/receipts/progress, changed ballots, result privacy/dense ties/reveal, immutable snapshots after member deletion and cascading poll deletion.');
}finally{await pg.close();}
