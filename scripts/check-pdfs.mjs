import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../vercel/database.js';
import {createPlans} from '../vercel/plans.js';
import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};const pool={query,connect:async()=>({query,release(){}})};
const config={clientId:'test',clientSecret:'test',refreshToken:'test',accessToken:'NEVER-EXPOSE',expiresAt:Date.now()+3600000,spreadsheetId:'testsheet'};
const stored=new Map();let downloads=0,failDrive=false;
const storage={get:async key=>key==='private/google.json'?{json:async()=>config}:stored.has(key)?{json:async()=>JSON.parse(stored.get(key).toString())}:null,put:async(key,value)=>stored.set(key,value),pdfPlaybackUrl:async(key,seconds)=>{assert.equal(seconds,3600);assert.ok(stored.has(key));return 'https://private.test/'+key+'?signed=short-lived';}};
const env={DB:createDatabase(pool),FILES:storage,plans:createPlans(pool),ADMIN_PASSWORD:'test-only',PUBLIC_ORIGIN:'https://hub.test'};
const ids={};for(const [name,md,arranger] of [['Member',0,0],['MD',1,0],['Arranger',0,1]]){ids[name]=(await query('INSERT INTO cucac.users(name,password_hash,created_at,is_md,is_arranger) VALUES($1,\'unused\',now()::text,$2,$3) RETURNING id',[name,md,arranger])).rows[0].id;await query('INSERT INTO cucac.sessions VALUES($1,$2,now()::text)',[name+'-session',ids[name]]);}
await query("UPDATE cucac.plan_terms SET is_current=(label='2026 Fall')");const term=(await query('SELECT id FROM cucac.plan_terms WHERE is_current')).rows[0].id;
const folder='scoreFolder123',missing='missingFolder123',broken='brokenFolder123';for(const [title,id] of [['Song',folder],['Missing',missing],['Broken',broken],['Pending','']])await query('INSERT INTO cucac.plan_songs(term_id,title,folder_url) VALUES($1,$2,$3)',[term,title,id?'https://drive.google.com/drive/folders/'+id:'']);
let files=[{id:'firstPdfFile123',name:'first.pdf',mimeType:'application/pdf',modifiedTime:'2026-10-01T00:00:00Z'},{id:'musicXmlFile123',name:'score.musicxml',mimeType:'application/xml'}];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{const url=new URL(input);if(url.searchParams.get('alt')==='media'){assert.equal(options.headers.Authorization,'Bearer NEVER-EXPOSE');downloads++;return new Response('%PDF-1.7\nTEST PDF',{headers:{'content-type':'application/pdf'}});}if(url.hostname==='www.googleapis.com'&&url.pathname==='/drive/v3/files'){const parent=url.searchParams.get('q');if(parent.includes(broken))return new Response('{}',{status:503});return Response.json({files:parent.includes(folder)?files:[]});}if(url.pathname.includes('/upload/drive/v3/files')){files.push({id:'uploadedPdf123',name:'new.pdf',mimeType:'application/pdf',modifiedTime:'2026-10-09T00:00:00Z'});return Response.json({id:'uploadedPdf123'});}return Response.json({sheets:[{properties:{title:'Scores'},data:[{rowData:[{values:[{formattedValue:'曲名Song Title'}]}]}]}]});};
async function request(path,user='Member',body,status=200){const headers=user?{Cookie:'solo_sid='+user+'-session'}:{};const options={headers,method:body?'POST':'GET'};if(body instanceof FormData)options.body=body;else if(body){headers['Content-Type']='application/json';options.body=JSON.stringify(body);}const response=await worker.fetch(new Request('https://hub.test'+path,options),env);const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));assert.ok(!JSON.stringify(data).includes('NEVER-EXPOSE'));return data;}
const route=(name,id=folder)=>'/api/scores/pdf-'+name+'?folderId='+id;
try{
 await request(route('info'),null,undefined,401);await request(route('info','arbitraryFolder123'),'Member',undefined,404);
 let data=await request(route('info'));assert.equal(data.defaultPdfId,'firstPdfFile123');assert.equal(data.selection,'single');assert.equal(data.files.length,1);assert.equal(data.canManagePdf,false);
 data=await request(route('url'));assert.ok(data.url.startsWith('https://private.test/'));assert.equal(downloads,1);await request(route('url'));assert.equal(downloads,1);
 await request(route('url')+'&fileId=arbitraryFile123','Member',undefined,404);await request(route('url')+'&fileId=musicXmlFile123','Member',undefined,404);await request(route('star'),'Member',{fileId:'firstPdfFile123'},403);
 files.push({id:'latestPdfFile123',name:'latest.pdf',mimeType:'application/pdf',modifiedTime:'2026-10-08T00:00:00Z'});data=await request(route('info'));assert.equal(data.defaultPdfId,'latestPdfFile123');assert.equal(data.selection,'latest');
 data=await request(route('star'),'Arranger',{fileId:'firstPdfFile123'});assert.equal(data.defaultPdfId,'firstPdfFile123');assert.equal((await request(route('info'))).selection,'starred');await request(route('star'),'MD',{fileId:'musicXmlFile123'},404);
 files[0].modifiedTime='2026-10-09T00:00:00Z';await request(route('url'));assert.equal(downloads,2);files=files.filter(file=>file.id!=='firstPdfFile123');assert.equal((await request(route('info'))).defaultPdfId,'latestPdfFile123');
 const form=new FormData();form.append('file',new Blob(['%PDF-1.7\nnew'],{type:'application/pdf'}),'new.pdf');data=await request(route('upload'),'MD',form);assert.equal(data.defaultPdfId,'uploadedPdf123');await request(route('upload'),'Member',form,403);
 const bad=new FormData();bad.append('file',new Blob(['not PDF']),'fake.pdf');await request(route('upload'),'MD',bad,400);
 await request('/api/plan/pdf-check','Member',undefined,403);const report=await request('/api/plan/pdf-check','MD');assert.equal(report.songs.find(s=>s.title==='Missing').status,'missing');assert.equal(report.songs.find(s=>s.title==='Broken').status,'error');assert.equal(report.songs.find(s=>s.title==='Pending').status,'no_folder');assert.equal(report.songs.find(s=>s.title==='Song').status,'ready');
 assert.ok([...stored.keys()].every(key=>key.startsWith('private/')));
 console.log('PASS: authenticated library/plan PDF access; single, latest and starred defaults; removed-file fallback; private signed playback/cache refresh; non-PDF and foreign-file rejection; MD PDF upload; missing/error distinction; no OAuth exposure.');
}finally{globalThis.fetch=originalFetch;await pg.close();}
