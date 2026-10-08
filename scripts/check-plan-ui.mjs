import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const state=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/plan-state.json','utf8'));
const people=state.members.filter(m=>!m.isAlumni&&!m.isCrew).map(m=>({id:m.id,name:m.fullName||m.name,voiceParts:m.voiceParts}));
const data={terms:[{id:1,label:'2026 Fall',archived:false},{id:2,label:'2025 Fall',archived:true}],term:{id:1,label:'2026 Fall',archived:false},canManage:true,canChoose:true,members:people,songs:[{id:1,title:'江南',folderUrl:'https://drive.google.com/drive/folders/song1',locked:false,entries:[]},{id:2,title:'天黑黑',folderUrl:'',locked:true,entries:[{memberId:people[0].id,name:people[0].name,part:'alto'}]}]};
state.library={...(state.library||{}),ready:true,semesters:[{id:10,label:'2026 Fall'},{id:11,label:'2025 Fall'}]};
const calls=[],window=new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
try{
 window.document.write(fs.readFileSync('public/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 window.fetch=async(url,options={})=>{const path=new URL(url,'http://localhost').pathname;let result={};if(path==='/api/state')result=state;
 else if(path==='/api/library/folders')result={id:10,label:'2026 Fall',url:'https://drive.google.com/drive/folders/semester',folders:[{id:'unindexed',name:'Drive-only song',url:'https://drive.google.com/drive/folders/unindexed'}]};
 else if(path==='/api/plan/library')result={folders:[{name:'Love Yourself',id:'song3',semester:'2026 Fall'},{name:'Old song',id:'song4',semester:'2025 Fall, 2026 Fall'},{name:'Earlier song',id:'song5',semester:'2025 Fall'}]};
 else if(path==='/api/plan')result=data;
 else if(path.startsWith('/api/plan/')){const body=JSON.parse(options.body);calls.push({path,body});if(path.includes('/entry/')){const memberId=body.memberId||state.user.id,song=data.songs.find(s=>s.id===Number(path.split('/').at(-1)));song.entries=song.entries.filter(e=>e.memberId!==memberId);if(body.part)song.entries.push({memberId,name:state.profile.fullName||state.user.name,part:body.part});}result=data;}
 else if(path.includes('/photos'))result={photos:[]};return {ok:true,json:async()=>structuredClone(result)};};
 const html=fs.readFileSync('public/index.html','utf8');const main=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const loading'))[1];window.eval(fs.readFileSync('public/plan.js','utf8')+'\n'+main+'\nwindow.planTest={open:planOpenSong,loadLibrary:planLoadLibrary,rerender:()=>render(latest),member:()=>{planData.canManage=false;planData.canChoose=false;renderPlan();},archive:()=>{planData.term.archived=true;renderPlan();}};');
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));await tick();await tick();
 const doc=window.document;assert.equal(doc.querySelector('#open-plan'),null);doc.querySelector('#open-scores').click();await tick();await tick();assert.equal(doc.querySelector('#browse-lineup').hidden,false);assert.equal(doc.querySelector('#browse-repertoire').hidden,false);doc.querySelector('#browse-lineup').click();await tick();await tick();
 const noNull=()=>assert.doesNotMatch(doc.querySelector('#plan-body').textContent,/null/);noNull();
 assert.ok(doc.querySelector('.plan-table'));assert.equal(doc.querySelector('.plan-table thead a').href,'https://drive.google.com/drive/folders/song1');
 doc.querySelector('.plan-table thead button').click();await tick();const signup=[...doc.querySelectorAll('#plan form')].find(f=>f.querySelector('h3')?.textContent.includes('My signup'));assert.ok(signup);
 signup.elements.part.value='tenor';signup.dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();await tick();assert.equal(calls.at(-1).body.part,'tenor');assert.ok(doc.querySelector('.plan-lineups').textContent.includes('Tenor'));
 window.planTest.open(null);assert.equal(doc.querySelector('.plan-table .plan-part').textContent,'T');
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('This semester’s songs')).click();await tick();await tick();const source=doc.querySelector('#plan select[aria-label="曲库学期 / Library semester"]');assert.equal(source.value,'2026fall');assert.equal(doc.querySelectorAll('.plan-library-choice').length,3);
 const search=doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]');search.value='Love';search.dispatchEvent(new window.Event('input'));assert.equal(doc.querySelectorAll('.plan-library-choice').length,1);
 const choice=doc.querySelector('.plan-library-choice input');choice.checked=true;choice.dispatchEvent(new window.Event('change'));
 const addSelected=[...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('Add selected songs'));addSelected.click();await tick();await tick();assert.equal(calls.at(-1).path,'/api/plan/bulk/1');assert.equal(calls.at(-1).body.songs[0].folderUrl,'https://drive.google.com/drive/folders/song3');
 const nextSource=doc.querySelector('#plan select[aria-label="曲库学期 / Library semester"]');nextSource.value='2025fall';nextSource.dispatchEvent(new window.Event('change'));assert.equal(doc.querySelectorAll('.plan-library-choice').length,0); // The retained search still filters this source.
 const nextSearch=doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]');nextSearch.value='';nextSearch.dispatchEvent(new window.Event('input'));assert.equal(doc.querySelectorAll('.plan-library-choice').length,2);
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('Select all results')).click();assert.equal(doc.querySelectorAll('.plan-library-choice input:checked').length,2);
 const draft=doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]');draft.value='Draft search';draft.focus();window.planTest.rerender();assert.equal(doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]').value,'Draft search');
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('View lineup')).click();doc.querySelector('.plan-mobile-toggle').click();assert.ok(doc.querySelector('.plan-table-wrap').classList.contains('mobile-open'));assert.equal(doc.querySelector('.plan-mobile-cards').hidden,true);
 window.planTest.archive();assert.equal(doc.querySelector('#plan .plan-table').textContent.includes('江南'),true);window.planTest.open(1);noNull();window.planTest.member();noNull();assert.equal(doc.querySelectorAll('#plan-body>div.stack form').length,0);
 console.log('PASS: DOM homepage navigation, table/score links, per-song signup, library selection, edit preservation during polling, mobile table toggle, and archived read-only lineup.');
}finally{await window.happyDOM.abort();window.close();}
