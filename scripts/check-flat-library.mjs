import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../vercel/database.js';
import {createGoogle} from '../worker/google.js';
import worker from '../dist/vercel-worker.mjs';
for(const match of fs.readFileSync('public/index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))parse(match[1],{sourceType:'script'});
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})};
const config={clientId:'test',clientSecret:'test',refreshToken:'test',accessToken:'test',expiresAt:Date.now()+3600000,spreadsheetId:'test-sheet',parentFolderId:'rootlibrary12345'};
const storage={get:async key=>key==='private/google.json'?{json:async()=>config}:null,put:async()=>{}};
const env={DB:createDatabase(pool),FILES:storage,ADMIN_PASSWORD:'test-admin-only',PUBLIC_ORIGIN:'https://hub.test',FLAT_LIBRARY:true};
let rows=[['曲名Song Title','编曲Arranger','性质Type','链接Link'],['Existing','Sophia','groups','https://drive.google.com/drive/folders/existingfolder1']];
const files=[['existingfolder1','Existing'],['newfolder00002','New song'],['newfolder00003','Third song']].map(([id,name])=>({id,name,mimeType:'application/vnd.google-apps.folder'}));
const oldFetch=globalThis.fetch;let writes=0;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname);let result;
 if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/files'){assert.ok(u.searchParams.get('q').includes("'rootlibrary12345' in parents"));result={files};}
 else if(options.method==='POST'&&path.endsWith(':append')){rows.push(...JSON.parse(options.body).values);writes++;result={};}
 else if(options.method==='POST'&&path.endsWith(':batchUpdate')){for(const data of JSON.parse(options.body).data){const m=data.range.match(/!([A-Z]+)(\d+)/);rows[Number(m[2])-1][m[1].charCodeAt(0)-65]=data.values[0][0];}writes++;result={};}
 else if(options.method==='PUT'){rows=JSON.parse(options.body).values;writes++;result={};}
 else if(u.searchParams.has('ranges'))result={sheets:[{data:[{rowData:rows.map(values=>({values:values.map(value=>String(value).startsWith('=HYPERLINK')?{formattedValue:'Song',userEnteredValue:{formulaValue:value}}:{formattedValue:value})}))}]}]};
 else if(path.includes('/values/'))result={values:path.endsWith('!1:1')?[rows[0]]:rows};
 else result={sheets:[{properties:{title:'Scores'}}]};
 return new Response(JSON.stringify(result),{status:200});
};
const call=async(path,body,cookie)=>{const r=await worker.fetch(new Request(env.PUBLIC_ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
try{
 const login=await call('/api/login',{name:'admin',password:env.ADMIN_PASSWORD});assert.equal(login.status,200);const cookie=login.cookie;
 const state=await call('/api/state',undefined,cookie);assert.equal(state.status,200);assert.equal(state.data.library.flat,true);assert.equal(state.data.library.ready,true);
 const root=state.data.library.semesters[0];assert.equal(root.label,'乐谱库');
 for(const id of ['all',String(root.id)]){const response=await call('/api/library/folders?semesterId='+id,undefined,cookie);assert.equal(response.status,200);assert.equal(response.data.folders.length,3);}
 assert.equal(writes,0,'browsing never modifies Sheet');
 let response=await call('/api/library/sync',{},cookie);assert.equal(response.status,200);assert.equal(response.data.added,2);assert.equal(rows.length,4);assert.equal(rows[1][1],'Sophia');assert.equal(rows[1][2],'groups');
 response=await call('/api/library/sync',{},cookie);assert.equal(response.status,200);assert.equal(response.data.added,0);assert.equal(rows.length,4);
 await query("UPDATE cucac.users SET is_arranger=1 WHERE name='admin'");
 const songs=await call('/api/library/songs',undefined,cookie);assert.equal(songs.status,200);assert.ok(songs.data.folders.every(item=>item.semesterId===root.id));
 const member=await call('/api/register',{name:'Member',password:'test-member'});assert.equal(member.status,201);assert.equal((await call('/api/library/sync',{},member.cookie)).status,403);
 assert.equal((await call('/api/library/sync',{})).status,401);
 const google=createGoogle(storage);rows=[['Title','Arranger','Type','Link'],['New song','Keep arranger','groups','']];response=await google.syncRootFolders(config.parentFolderId);assert.equal(response.linked,1);assert.equal(rows[1][1],'Keep arranger');
 rows=[];await google.syncRootFolders(config.parentFolderId);assert.equal(rows.length,4);assert.deepEqual(rows[0],['曲名Song Title','编曲Arranger','性质Type','链接Link']);
 await google.syncRootFolders(config.parentFolderId);assert.equal(rows.length,4);
 rows=[['Unrecognized data','Keep me']];await assert.rejects(google.syncRootFolders(config.parentFolderId),/sheet_headers/);assert.equal(rows[0][1],'Keep me');
 env.FLAT_LIBRARY=false;assert.equal((await call('/api/library/sync',{},cookie)).status,404);
 console.log('PASS: flat root browsing without Sheet writes, internal root mapping, protected import, three folders, repeat deduplication, preserved metadata, unique-title linking, empty initialization, invalid-header refusal, and unchanged non-flat routing.');
}finally{globalThis.fetch=oldFetch;await pg.close();}
