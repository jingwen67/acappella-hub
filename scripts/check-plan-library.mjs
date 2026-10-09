import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../vercel/database.js';
import {createPlans} from '../vercel/plans.js';
import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})};
const config={clientId:'test',clientSecret:'test',refreshToken:'test',accessToken:'test',expiresAt:Date.now()+3600000,spreadsheetId:'testsheet'};
const storage={get:async key=>key==='private/google.json'?{json:async()=>config}:null,put:async()=>{}};
const env={DB:createDatabase(pool),FILES:storage,ADMIN_PASSWORD:'test-admin-only',PUBLIC_ORIGIN:'https://hub.test',plans:createPlans(pool)};
const user=(await query("INSERT INTO cucac.users(name,password_hash,created_at,is_president) VALUES('President','unused',now()::text,1) RETURNING id")).rows[0].id;
await query("INSERT INTO cucac.sessions VALUES('test-session',$1,now()::text)",[user]);
const semester=(await query("INSERT INTO cucac.semesters(label,folder_id,created_at) VALUES('2026 Fall','semesterfolder',now()::text) RETURNING id")).rows[0].id;
const files=[{id:'uploaded',name:'Uploaded song',mimeType:'application/vnd.google-apps.folder'},{id:'shortcut',name:'Old song',mimeType:'application/vnd.google-apps.shortcut',shortcutDetails:{targetId:'older',targetMimeType:'application/vnd.google-apps.folder'}}];
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{const u=new URL(url);let result;
 if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/files'){assert.ok(u.searchParams.get('q').includes("'semesterfolder' in parents"));result={files};}
 else if(u.pathname.includes('/values/'))result={values:[['Title','Semester','Link'],['Old song','2025 Fall','https://drive.google.com/drive/folders/older']]};
 else if(u.searchParams.has('ranges'))result={sheets:[{data:[{startRow:0,rowData:[['Title','Semester','Link'],['Old song','2025 Fall','https://drive.google.com/drive/folders/older']].map(values=>({values:values.map(formattedValue=>({formattedValue}))}))}]}]};
 else result={sheets:[{properties:{title:'Scores'}}]};return new Response(JSON.stringify(result),{status:200});};
async function api(path,body,status=200,cookie=true){const headers=cookie?{Cookie:'solo_sid=test-session'}:{};const r=await worker.fetch(new Request('https://hub.test'+path,{headers,method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body)}),env);const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;}
try{
 await api('/api/plan?semesterId='+semester,undefined,401,false);
 await api('/api/plan?semesterId=9999',undefined,404);
 const browse=await api('/api/library/folders?semesterId='+semester);assert.equal(browse.folders.find(s=>s.name==='Old song').url,'https://drive.google.com/drive/folders/older');
 let plan=await api('/api/plan?semesterId='+semester);assert.equal(plan.term.label,'2026 Fall');assert.equal(plan.canChoose,true);assert.equal(plan.canManage,false);assert.equal(plan.songs.length,2);
 const song=plan.songs.find(s=>s.title==='Uploaded song');await api('/api/plan/delete/'+song.id,{});plan=await api('/api/plan?semesterId='+semester);assert.equal(plan.songs.length,1);
 files.push({id:'newUpload',name:'New upload',mimeType:'application/vnd.google-apps.folder'});plan=await api('/api/plan?semesterId='+semester);assert.equal(plan.songs.length,2);assert.ok(plan.songs.some(s=>s.title==='New upload'));assert.ok(!plan.songs.some(s=>s.id===song.id));
 plan=await api('/api/plan/bulk/'+plan.term.id,{songs:[{title:'Uploaded song',folderUrl:song.folderUrl}]});assert.ok(plan.songs.some(s=>s.id===song.id));
 console.log('PASS: browser API → trusted Drive folder and shortcut discovery → semester plan, authentication, missing semesters, President selection, excluded-song refresh, new uploads, and re-add identity.');
}finally{globalThis.fetch=originalFetch;await pg.close();}
