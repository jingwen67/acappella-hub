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
 const partners=[];for(let i=0;i<5;i++)partners.push((await query("INSERT INTO cucac.users(name,password_hash,created_at) VALUES($1,'test','2026-10-25') RETURNING id",['Candidate '+i])).rows[0].id);
 const snapshot=[3,2,1,1,0].map((likes,i)=>({id:i+1,name:'Option '+i,likes,again:0,rank:[1,2,3,3,4][i]}));
 for(const kind of ['solo','feedback','custom','pair','parts']){
  const p=(await query("INSERT INTO cucac.phases(title,status,created_by,created_at,closed_at,poll_type,part_a,part_labels,solo_results,revealed_ranks) VALUES($1,'closed',$2,'2026-10-25','2026-10-25',$3,$4,$5::jsonb,$6::jsonb,4) RETURNING id",[kind,users.creator,['feedback','custom'].includes(kind)?'solo':kind,kind==='custom'?'__custom_poll_v1__':'High',JSON.stringify(kind==='custom'?snapshot.map(s=>s.name):['High','Low']),JSON.stringify(snapshot)])).rows[0];
  if(['pair','parts'].includes(kind))for(const part of kind==='pair'?['pair']:['A','B'])for(let i=0;i<5;i++){
   const e=(await query("INSERT INTO cucac.duet_entries(phase_id,member1,member2,proposed_by,part,confirmed,created_at) VALUES($1,$2,$3,$4,$5,1,'2026-10-25') RETURNING id",[p.id,kind==='pair'?users.creator:partners[i],kind==='pair'?partners[i]:null,users.creator,part])).rows[0];
   for(const who of ['creator','otherMd','voter'].slice(0,snapshot[i].likes))await query('INSERT INTO cucac.duet_votes VALUES($1,$2,$3)',[p.id,e.id,users[who]]);
  }
  const before=(await api('/api/state','voter')).history[0].candidates;assert.ok(before.some(c=>c.rank===4));
  for(const who of ['admin','otherMd','voter'])await api(`/api/phases/${p.id}/revoke`,who,{rank:3},403);
  for(const rank of [undefined,null,0,1,2,5,3.5,'3'])await api(`/api/phases/${p.id}/revoke`,'creator',{rank},400);
  await api(`/api/phases/${p.id}/revoke`,'creator',{rank:4});let visible=(await api('/api/state','voter')).history[0].candidates;assert.deepEqual(visible,before.filter(c=>c.rank<=3));
  await api(`/api/phases/${p.id}/revoke`,'creator',{rank:3});visible=(await api('/api/state','voter')).history[0].candidates;assert.deepEqual(visible,before.filter(c=>c.rank<=2));
  await api(`/api/phases/${p.id}/revoke`,'creator',{rank:3},400);assert.equal((await query('SELECT revealed_ranks FROM cucac.phases WHERE id=$1',[p.id])).rows[0].revealed_ranks,2);
  await api(`/api/phases/${p.id}/reveal`,'creator',{});assert.deepEqual((await api('/api/state','voter')).history[0].candidates,before.filter(c=>c.rank<=3));
  assert.deepEqual((await query('SELECT solo_results FROM cucac.phases WHERE id=$1',[p.id])).rows[0].solo_results,snapshot);
 }
 const live=await api('/api/phases','creator',{title:'Live'},201);await api(`/api/phases/${live.phase.id}/revoke`,'creator',{rank:3},400);
 console.log('PASS: creator-only revoke in all five methods; first two ranks protected; invalid/stale targets rejected; selected and later ranks hidden including ties/all parts; persisted after refresh, snapshots unchanged and re-reveal restores exact results.');
}finally{await pg.close();}
