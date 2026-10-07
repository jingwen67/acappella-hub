import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import fs from 'node:fs';
const mf = new Miniflare({workers:[{name:"hub",modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['FILES'],bindings:{ADMIN_PASSWORD:'test-admin-password',PUBLIC_ORIGIN:'https://hub.test'}}]});
try {
 const db=await mf.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){const sql=fs.readFileSync('drizzle/'+file,'utf8');for(const part of sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(part).run();}
 const cookies={};
 async function api(path, who='',body=undefined,status=200){
  const headers={};if(who&&cookies[who])headers.Cookie=cookies[who];if(body!==undefined)headers['Content-Type']='application/json';
  const res=await mf.dispatchFetch('https://hub.test'+path,{method:body!==undefined?'POST':'GET',headers,body:body!==undefined?JSON.stringify(body):undefined});
  const raw=await res.text();assert.equal(res.status,status,`${path}: ${raw}`);const set=res.headers.get('set-cookie');if(set&&who)cookies[who]=set.split(';')[0];return raw?JSON.parse(raw):null;
 }
 const home=await mf.dispatchFetch('https://hub.test/');assert.equal(home.status,200);assert.match(await home.text(),/solo|阿卡贝拉/i);
 await api('/api/state','',undefined,401);
 const admin=await api('/api/login','admin',{name:'admin',password:'test-admin-password'});assert.equal(admin.user.isAdmin,true);
 const md=await api('/api/register','md',{name:'Jingwen',password:'abc12345'},201);
 const member=await api('/api/register','member',{name:'Singer',password:'abc12345'},201);
 await api('/api/register','duplicate',{name:'Jingwen',password:'abc12345'},409);
 await api('/api/login','bad',{name:'Jingwen',password:'wrong'},401);
 await api(`/api/admin/users/${md.user.id}`,'admin',{musicDirector:true,arranger:true});
 await api('/api/phases','member',{title:'Love Yourself',arrangerId:md.user.id},403);
 const round=await api('/api/phases','md',{title:'Love Yourself',arrangerId:md.user.id},201);assert.equal(round.phase.title,'Love Yourself');
 const phaseId=round.phase.id;
 await api(`/api/phases/${phaseId}/candidacy`,'member',{join:true});
 await api(`/api/phases/${phaseId}/vote`,'md',{candidateId:member.user.id,reaction:'like'});
 let state=await api('/api/state','md');assert.equal(state.phase.candidates[0].likes,1);
 state=await api('/api/state','member');assert.equal(state.phase.candidates[0].likes,undefined);
 await api(`/api/phases/${phaseId}/vote`,'md',{candidateId:member.user.id,reaction:'again'});
 state=await api('/api/state','md');assert.equal(state.phase.candidates[0].likes,0);assert.equal(state.phase.candidates[0].again,1);
 await api(`/api/phases/${phaseId}/close`,'member',{},403);
 await api('/api/profile','member',{fullName:'Singer Zhang',voicePart:'Alto',school:'Columbia',gradYear:'2027',funFact:'Loves music'});
 const form=new FormData();form.set('avatar',new Blob([fs.readFileSync('public/icon-192.png')],{type:'image/png'}),'avatar.png');
 const uploadRequest=new Request('https://hub.test/api/profile/avatar',{method:'POST',body:form});
 let r=await mf.dispatchFetch(uploadRequest.url,{method:'POST',headers:{Cookie:cookies.member,'Content-Type':uploadRequest.headers.get('content-type')},body:await uploadRequest.arrayBuffer()});assert.equal(r.status,200,await r.text());
 r=await mf.dispatchFetch(`https://hub.test/api/avatars/${member.user.id}`,{headers:{Cookie:cookies.md}});assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,fs.statSync('public/icon-192.png').size);

 // Photo gallery: legacy preservation, cross-member upload, ownership checks, selection and deletion.
 const outsider=await api('/api/register','outsider',{name:'Other singer',password:'abc12345'},201);
 const albumPath='/api/profiles/'+member.user.id+'/photos';
 await api(albumPath,'',undefined,401);
 let album=await api(albumPath,'md');assert.equal(album.photos.length,1);const legacy=album.photos[0];assert.equal(legacy.isAvatar,true);
 async function uploadPhoto(who,bytes=fs.readFileSync('public/icon-192.png'),type='image/png',filename='photo.png',status=201){
  const form=new FormData();form.set('photo',new Blob([bytes],{type}),filename);
  const req=new Request('https://hub.test'+albumPath,{method:'POST',body:form});
  const r=await mf.dispatchFetch(req.url,{method:'POST',headers:{Cookie:cookies[who],'Content-Type':req.headers.get('content-type')},body:await req.arrayBuffer()});
  const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body;
 }
 album=await uploadPhoto('md');const added=album.photos.find(p=>p.id!==legacy.id);assert.equal(added.name,'Jingwen');assert.equal(added.canDelete,true);assert.equal(added.canSetAvatar,false);
 await uploadPhoto('md',Buffer.from('not an image'),'image/png','photo.png',400);
 await api('/api/photos/'+added.id+'/avatar','md',{},403);
 await api('/api/photos/'+added.id+'/delete','outsider',{},403);
 await api('/api/photos/'+legacy.id+'/delete','md',{},403);
 await api('/api/photos/'+added.id+'/avatar','member',{});
 album=await api(albumPath,'member');assert.equal(album.photos.find(p=>p.id===added.id).isAvatar,true);assert.equal(album.photos.every(p=>p.canDelete&&p.canSetAvatar),true);
 r=await mf.dispatchFetch('https://hub.test/api/photos/'+added.id,{headers:{Cookie:cookies.outsider}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
 await api('/api/photos/'+added.id+'/delete','md',{});
 state=await api('/api/state','member');assert.equal(state.profile.avatar,'');
 album=await api(albumPath,'member');assert.equal(album.photos.length,1);
 await api('/api/photos/'+legacy.id+'/avatar','member',{});
 await api('/api/photos/'+legacy.id+'/delete','member',{});
 album=await api(albumPath,'member');assert.equal(album.photos.length,0);

 await api(`/api/phases/${phaseId}/close`,'md',{});
 state=await api('/api/state','md');assert.equal(state.phase,null);assert.equal(state.history[0].candidates[0].again,1);
 await api('/api/google/settings','member',{clientId:'x'},403);
 await api('/api/google/settings','admin',{clientId:'test.apps.googleusercontent.com',clientSecret:'test-secret',spreadsheet:'',parentFolder:''});
 r=await mf.dispatchFetch('https://hub.test/api/google/connect',{headers:{Cookie:cookies.admin},redirect:'manual'});assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).searchParams.get('redirect_uri'),'https://hub.test/api/google/callback');
 await api(`/api/phases/${phaseId}/delete`,'admin',{});
 album=await uploadPhoto('md');const cleanupPhoto=album.photos[0];
 await api(`/api/admin/users/${member.user.id}/delete`,'admin',{});
 await api('/api/photos/'+cleanupPhoto.id,'md',undefined,404);
 const files=await mf.getR2Bucket('FILES');assert.equal(await files.get('photos/'+cleanupPhoto.id+'.png'),null);
 state=await api('/api/state','md');assert.equal(state.members.some(x=>x.id===member.user.id),false);
 console.log('PASS: Worker runtime, registration/login, roles, shared votes, result visibility, profile/avatar, gallery permissions and cleanup, history, deletion, Google redirect/config.');
} finally {await mf.dispose();}
