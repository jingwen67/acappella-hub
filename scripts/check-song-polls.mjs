import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {createDatabase} from '../vercel/database.js';import {createVoting} from '../vercel/voting.js';import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};if(sql.includes('CREATE TABLE IF NOT EXISTS cucac.custom_votes')){await pg.exec(sql);return {rows:[]};}const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})};
const config={clientId:'test',clientSecret:'test',refreshToken:'test',accessToken:'test',expiresAt:Date.now()+3600000,parentFolderId:'rootlibrary12345'};
const env={DB:createDatabase(pool),FILES:{get:async key=>key==='private/google.json'?{json:async()=>config}:null,put:async()=>{}},ADMIN_PASSWORD:'testing',PUBLIC_ORIGIN:'https://hub.test',voting:createVoting(pool)};
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({files:[{id:'songFolder11111',name:'Song A',mimeType:'application/vnd.google-apps.folder'},{id:'songFolder22222',name:'Song B',mimeType:'application/vnd.google-apps.folder'},{id:'songFolder33333',name:'Song C',mimeType:'application/vnd.google-apps.folder'}]}));
const cookies={};async function api(path,who,body,status=200){const r=await worker.fetch(new Request('https://hub.test'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookies[who]||'','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return d;}
try{
 const md=await api('/api/register','md',{name:'MD',password:'test-password'},201);const voter=await api('/api/register','voter',{name:'Member',password:'test-password'},201);await query('UPDATE cucac.users SET is_md=1 WHERE id=$1',[md.user.id]);await query("INSERT INTO cucac.semesters(label,folder_id,created_at) VALUES('Test term','rootlibrary12345',now()::text)");
 for(const flat of [false]){env.FLAT_LIBRARY=flat;
 const body={pollType:'song',title:'Pick songs',songFolderIds:['songFolder11111','songFolder22222'],maxVotes:2};
 await api('/api/phases','voter',body,403);await api('/api/phases','md',{...body,songFolderIds:['songFolder11111','invalid']},400);await api('/api/phases','md',{...body,maxVotes:3},400);
 const created=await api('/api/phases','md',body,201);assert.equal(created.phase.pollType,'song');assert.equal(created.phase.anonymous,false);assert.deepEqual(created.phase.candidates.map(c=>c.name),['Song A','Song B']);const id=created.phase.id;
 await api('/api/phases/'+id+'/enter','voter',{});await api('/api/phases/'+id+'/vote','voter',{candidateId:1,reaction:'like'});const totals=await api('/api/phases/'+id+'/ballots','md');assert.ok(JSON.stringify(totals).includes('Song A'));
 await api('/api/phases/'+id+'/submit','voter',{votes:[{candidateId:1,reaction:'like'}]});
 await api('/api/phases/'+id+'/songs','voter',{songFolderIds:['songFolder33333']},403);
 await api('/api/phases/'+id+'/songs','md',{songFolderIds:['not-in-library']},400);
 const appended=await api('/api/phases/'+id+'/songs','md',{songFolderIds:['songFolder33333','songFolder11111']});
 assert.deepEqual(appended.phase.candidates.map(c=>[c.id,c.name]),[[1,'Song A'],[2,'Song B'],[3,'Song C']]);assert.equal(appended.phase.voteLimit,2);
 assert.equal((await query('SELECT option_id FROM cucac.custom_votes WHERE phase_id=$1',[id])).rows[0].option_id,1);
 assert.equal((await query('SELECT voter_id FROM cucac.vote_submissions WHERE phase_id=$1',[id])).rows.length,1);
 await api('/api/phases/'+id+'/songs','md',{songFolderIds:['songFolder33333']});
 assert.equal((await api('/api/state?phaseId='+id,'md')).phase.candidates.length,3);
 await api('/api/phases/'+id+'/vote','voter',{candidateId:3,reaction:'like'});
 assert.equal((await query('SELECT voter_id FROM cucac.vote_submissions WHERE phase_id=$1',[id])).rows.length,0);
 await api('/api/phases/'+id+'/close','md',{});await api('/api/phases/'+id+'/songs','md',{songFolderIds:['songFolder33333']},400);assert.equal((await api('/api/state','md')).history.find(h=>h.id===id).pollType,'song');
 const unlimited=await api('/api/phases','md',{...body,maxVotes:null},201);const freeId=unlimited.phase.id;assert.equal(unlimited.phase.unlimited,true);assert.equal(unlimited.phase.voteLimit,2);
 await api('/api/phases/'+freeId+'/enter','voter',{});
 await api('/api/phases/'+freeId+'/vote','voter',{candidateId:1,reaction:'like'});await api('/api/phases/'+freeId+'/vote','voter',{candidateId:2,reaction:'like'});
 const expanded=await api('/api/phases/'+freeId+'/songs','md',{songFolderIds:['songFolder33333']});assert.equal(expanded.phase.voteLimit,3);assert.equal(expanded.phase.unlimited,true);
 await api('/api/phases/'+freeId+'/vote','voter',{candidateId:3,reaction:'like'});
 assert.equal((await query('SELECT option_id FROM cucac.custom_votes WHERE phase_id=$1',[freeId])).rows.length,3);
 const defaultBody={...body};delete defaultBody.maxVotes;assert.equal((await api('/api/phases','md',defaultBody,201)).phase.unlimited,true);
 const anonymous=await api('/api/phases','md',{...body,anonymous:true},201);assert.equal(anonymous.phase.anonymous,true);await api('/api/phases/'+anonymous.phase.id+'/ballots','md',undefined,403);
 }
 console.log('PASS: song library validation, MD-only creation, flat and semester libraries, named default, anonymous option, votes, inspections and history.');
}finally{globalThis.fetch=oldFetch;await pg.close();}
