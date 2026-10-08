import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const state=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/plan-state.json','utf8'));
const people=state.members.filter(m=>!m.isAlumni&&!m.isCrew).map(m=>({id:m.id,name:m.fullName||m.name,voiceParts:m.voiceParts}));
const data={terms:[{id:1,label:'2026 Fall',archived:false},{id:2,label:'2025 Fall',archived:true}],term:{id:1,label:'2026 Fall',archived:false},canManage:true,members:people,songs:[{id:1,title:'江南',folderUrl:'https://drive.google.com/drive/folders/song1',locked:false,entries:[]},{id:2,title:'天黑黑',folderUrl:'',locked:true,entries:[{memberId:people[0].id,name:people[0].name,part:'alto'}]}]};
const calls=[],window=new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
try{
 window.document.write(fs.readFileSync('public/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 window.fetch=async(url,options={})=>{const path=new URL(url,'http://localhost').pathname;let result={};if(path==='/api/state')result=state;
 else if(path==='/api/plan/library')result={folders:[{name:'Love Yourself',id:'song3',semester:'2026 Fall'}]};
 else if(path==='/api/plan')result=data;
 else if(path.startsWith('/api/plan/')){const body=JSON.parse(options.body);calls.push({path,body});if(path.includes('/entry/')){const memberId=body.memberId||state.user.id,song=data.songs.find(s=>s.id===Number(path.split('/').at(-1)));song.entries=song.entries.filter(e=>e.memberId!==memberId);if(body.part)song.entries.push({memberId,name:state.profile.fullName||state.user.name,part:body.part});}result=data;}
 else if(path.includes('/photos'))result={photos:[]};return {ok:true,json:async()=>structuredClone(result)};};
 const html=fs.readFileSync('public/index.html','utf8');const main=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const loading'))[1];window.eval(fs.readFileSync('public/plan.js','utf8')+'\n'+main+'\nwindow.planTest={open:planOpenSong,loadLibrary:planLoadLibrary,rerender:()=>render(latest),archive:()=>{planData.term.archived=true;renderPlan();}};');
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));await tick();await tick();
 const doc=window.document;doc.querySelector('#open-plan').click();await tick();await tick();
 assert.ok(doc.querySelector('.plan-table'));assert.equal(doc.querySelector('.plan-table thead a').href,'https://drive.google.com/drive/folders/song1');
 doc.querySelector('.plan-table thead button').click();await tick();const signup=[...doc.querySelectorAll('#plan form')].find(f=>f.querySelector('h3')?.textContent.includes('My signup'));assert.ok(signup);
 signup.elements.part.value='tenor';signup.dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();await tick();assert.equal(calls.at(-1).body.part,'tenor');assert.ok(doc.querySelector('.plan-lineups').textContent.includes('Tenor'));
 window.planTest.open(null);assert.equal(doc.querySelector('.plan-table .plan-part').textContent,'T');
 await window.planTest.loadLibrary();const search=doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]');search.value='Love';search.dispatchEvent(new window.Event('input'));doc.querySelector('.plan-library-results button').click();
 assert.equal(doc.querySelector('#plan input[name="title"]').value,'Love Yourself');assert.equal(doc.querySelector('#plan input[name="folderUrl"]').value,'https://drive.google.com/drive/folders/song3');
 const title=doc.querySelector('#plan input[name="title"]');title.value='Draft title';title.focus();window.planTest.rerender();assert.equal(doc.querySelector('#plan input[name="title"]').value,'Draft title');
 doc.querySelector('.plan-mobile-toggle').click();assert.ok(doc.querySelector('.plan-table-wrap').classList.contains('mobile-open'));assert.equal(doc.querySelector('.plan-mobile-cards').hidden,true);
 window.planTest.archive();assert.equal(doc.querySelector('#plan .plan-table').textContent.includes('江南'),true);window.planTest.open(1);assert.equal(doc.querySelectorAll('#plan-body>div.stack form').length,0);
 console.log('PASS: DOM homepage navigation, table/score links, per-song signup, library selection, edit preservation during polling, mobile table toggle, and archived read-only lineup.');
}finally{await window.happyDOM.abort();window.close();}
