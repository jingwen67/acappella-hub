import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../vercel/database.js';
import worker from '../dist/vercel-worker.mjs';
const pg=new PGlite();await pg.exec(fs.readFileSync('vercel/schema.sql','utf8'));
const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})};const config={clientId:'test',clientSecret:'test',refreshToken:'test',accessToken:'test',expiresAt:Date.now()+3600000,spreadsheetId:'testsheet'};
const storage={get:async key=>key==='private/google.json'?{json:async()=>config}:null,put:async()=>{}};
const env={DB:createDatabase(pool),FILES:storage,ADMIN_PASSWORD:'test-only',PUBLIC_ORIGIN:'https://hub.test'};
const user=(await query("INSERT INTO cucac.users(name,password_hash,created_at,is_arranger) VALUES('Arranger','unused',now()::text,1) RETURNING id")).rows[0].id;
await query("INSERT INTO cucac.sessions VALUES('test-session',$1,now()::text)",[user]);
const semester=(await query("INSERT INTO cucac.semesters(label,folder_id,created_at) VALUES('2026 Fall','semesterFolder123',now()::text) RETURNING id")).rows[0].id;
const folder='oldSongFolder123',headers=['曲名Song Title','编曲Arranger','学期Semester','性质Type','链接Link'];
let row=['Old song','Joey Zhao, Sophia Peng','2024 Spring, 2025 Fall, 2026 Fall','大歌/all members, 小组/small groups','Old song'];let folderName='Old folder name';const driveWrites=[],sheetWrites=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{const u=new URL(url);let result;
 if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/files'){const folders=u.searchParams.get('q')?.includes('application/vnd.google-apps.folder');result={files:folders?[{id:folder,name:folderName,mimeType:'application/vnd.google-apps.folder'}]:[]};}
 else if(u.pathname==='/drive/v3/files/'+folder){driveWrites.push({params:u.search,body:JSON.parse(options.body)});folderName=JSON.parse(options.body).name||folderName;result={id:folder};}
 else if(u.searchParams.has('ranges'))result={sheets:[{data:[{startRow:0,rowData:[headers,row].map((values,index)=>({values:values.map((value,column)=>({formattedValue:value,userEnteredValue:{stringValue:value},...(index===1&&column===4?{hyperlink:'https://drive.google.com/drive/folders/'+folder}:{}),...(column===2?{dataValidation:{condition:{type:'ONE_OF_LIST',values:['2024 Spring','2025 Fall','2026 Fall','2027 Spring'].map(userEnteredValue=>({userEnteredValue}))}}}:{})}))}))}]}]};
 else if(u.pathname.endsWith('/values:batchUpdate')){const body=JSON.parse(options.body);sheetWrites.push(body);for(const cell of body.data){const column=cell.range.match(/!([A-Z]+)2$/)[1].charCodeAt(0)-65;row[column]=cell.values[0][0];}result={totalUpdatedCells:body.data.length};}
 else if(u.pathname.includes('/values/')){if(options.method==='PUT'){sheetWrites.push(JSON.parse(options.body));row=JSON.parse(options.body).values[0];result={updatedCells:5};}else result={values:u.pathname.endsWith(encodeURIComponent("'Scores'!1:1"))?[headers]:[row]};}
 else result={sheets:[{properties:{title:'Scores'}}]};return new Response(JSON.stringify(result),{status:200});};
async function request(path,form){const r=await worker.fetch(new Request('https://hub.test'+path,{headers:{Cookie:'solo_sid=test-session'},method:form?'POST':'GET',body:form}),env);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}
try{
 let detail=await request(`/api/scores/folder?semesterId=${semester}&folderId=${folder}`);assert.equal(detail.title,'Old song');assert.deepEqual(detail.arrangers,['Joey Zhao','Sophia Peng']);assert.deepEqual(detail.kinds,['all','group']);assert.deepEqual(detail.semesterLabels,['2024 Spring','2025 Fall','2026 Fall']);assert.ok(detail.semesterOptions.includes('2027 Spring'));
 const form=new FormData();for(const [name,value] of [['title','Old song'],['folderId',folder],['sourceSemesterId',String(semester)],['semesterSelection','1'],['semester','2024 Spring'],['semester','2027 Spring'],['arranger','Joey Zhao'],['arranger','Sophia Peng'],['kind','all'],['kind','group']])form.append(name,value);
 await request('/api/scores/edit',form);assert.equal(sheetWrites.length,1);assert.equal(row[2],'2024 Spring, 2027 Spring');assert.equal(row[1],'Joey Zhao, Sophia Peng');assert.equal(row[3],'大歌/all members, 小组/small group');assert.ok(driveWrites.every(write=>!write.params.includes('addParents')&&!write.params.includes('removeParents')));
 detail=await request(`/api/scores/folder?semesterId=${semester}&folderId=${folder}`);assert.deepEqual(detail.semesterLabels,['2024 Spring','2027 Spring']);
 console.log('PASS: folder → rich-link Sheet entry → multi-arranger/kind/semester autofill; dropdown semester options; exact multi-semester save/reload without moving Drive folders.');
}finally{globalThis.fetch=originalFetch;await pg.close();}
