import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const state=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/plan-state.json','utf8'));
const people=state.members.filter(m=>!m.isAlumni&&!m.isCrew).map(m=>({id:m.id,name:m.fullName||m.name,voiceParts:m.voiceParts}));
state.library={...(state.library||{}),ready:true,semesters:[{id:10,label:'2026 Fall'},{id:11,label:'2025 Fall'}]};
const data={terms:[{id:1,label:'2026 Fall',is_current:true,archived:false},{id:2,label:'2025 Fall',is_current:false,archived:true}],term:{id:1,label:'2026 Fall',isCurrent:true,archived:false},canManage:true,canChoose:true,members:people,songs:[{id:1,title:'江南',folderUrl:'https://drive.google.com/drive/folders/song1',locked:false,entries:[]},{id:2,title:'天黑黑',folderUrl:'',locked:true,entries:[]}]};
const calls=[],window=new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
try{
 window.document.write(fs.readFileSync('public/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 window.fetch=async(url,options={})=>{const parsed=new URL(url,'http://localhost'),path=parsed.pathname;let result={};if(path==='/api/state')result=state;
 else if(path==='/api/plan/library'){calls.push({path,source:parsed.searchParams.get('semesterId')});result={folders:parsed.searchParams.has('semesterId')?[{name:'Older song',id:'song4',semester:'2025 Fall'}]:[{name:'Love Yourself',id:'song3',semester:'2026 Fall'},{name:'Older song',id:'song4',semester:'2025 Fall'}]};}
 else if(path==='/api/plan'){result=data;}
 else if(path.startsWith('/api/plan/')){const body=JSON.parse(options.body);calls.push({path,body});const id=Number(path.split('/').at(-1));
  if(path.includes('/entry/')){const memberId=body.memberId||window.planTest.user().id,song=data.songs.find(s=>s.id===id);if(body.remove)song.entries=song.entries.filter(e=>!(e.memberId===memberId&&e.part===body.part));else if(!song.entries.some(e=>e.memberId===memberId&&e.part===body.part))song.entries.push({memberId,name:people.find(p=>p.id===memberId)?.name||'Singer',part:body.part});}
  if(path.includes('/big/'))data.songs.find(s=>s.id===id).bigSong=body.bigSong;
  if(path.includes('/add/'))data.songs.push({id:3,title:body.title,folderUrl:'',locked:false,entries:[]});result=data;}
 return {ok:true,json:async()=>structuredClone(result)};};
 const html=fs.readFileSync('public/index.html','utf8'),main=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const loading'))[1];
 window.eval(fs.readFileSync('public/plan.js','utf8')+'\n'+main+'\nwindow.planTest={user:()=>latest.user,open:planOpenSong,rerender:()=>render(latest),member:()=>{latest.user={id:'+people[0].id+',isAdmin:false,isMd:false};latest.profile={isAlumni:false,isCrew:false,voiceParts:["alto"]};planData.canManage=false;planData.canChoose=false;renderPlan();},archive:()=>{planData.term.archived=true;renderPlan();}};');
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));await tick();await tick();const doc=window.document;
 assert.ok(doc.querySelector('#open-plan').textContent.includes('这学期唱什么'));assert.equal(doc.querySelector('#browse-lineup'),null);
 doc.querySelector('#open-plan').click();await tick();await tick();const body=doc.querySelector('#plan-body');assert.doesNotMatch(body.textContent,/null/);
 assert.deepEqual([...doc.querySelectorAll('.plan-table thead th')].slice(1).map(n=>n.textContent),['Solo','Soprano','Alto','Tenor','Baritone','Bass','Bbox']);
 assert.equal(doc.querySelector('.plan-table tbody tr th button').textContent,'江南');assert.equal(doc.querySelector('.plan-table tbody tr th a').href,'https://drive.google.com/drive/folders/song1');
 data.songs[1].bigSong=true;doc.querySelector('tr[data-song-id="2"] th input').checked=true;doc.querySelector('tr[data-song-id="2"] th input').dispatchEvent(new window.Event('change'));await tick();await tick();assert.equal(doc.querySelector('.plan-table tbody tr').dataset.songId,'2');doc.querySelector('tr[data-song-id="2"] th input').checked=false;doc.querySelector('tr[data-song-id="2"] th input').dispatchEvent(new window.Event('change'));await tick();await tick();
 assert.doesNotMatch(body.textContent,/Solo 由 MD 安排/);
 const big=doc.querySelector('tr[data-song-id="1"] th input[type="checkbox"]');assert.ok(!big.disabled);big.checked=true;big.dispatchEvent(new window.Event('change'));await tick();await tick();assert.equal(calls.at(-1).path,'/api/plan/big/1');assert.equal(calls.at(-1).body.bigSong,true);assert.ok(doc.querySelector('tr[data-song-id="1"] th input').checked);
 const soloForm=doc.querySelector('tr[data-song-id="1"] td[data-part="solo"] form');soloForm.elements.memberId.value=String(people[0].id);soloForm.dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();await tick();assert.equal(calls.at(-1).body.part,'solo');
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('Add / manage songs')).click();await tick();await tick();assert.equal(doc.querySelectorAll('.plan-library-choice').length,2);
 const source=doc.querySelector('#plan select[aria-label="曲库学期 / Library semester"]');source.value='11';source.dispatchEvent(new window.Event('change'));await tick();await tick();assert.equal(calls.at(-1).source,'11');assert.equal(doc.querySelectorAll('.plan-library-choice').length,1);
 const search=doc.querySelector('#plan input[aria-label="搜索曲库 / Search score library"]');search.value='Older';search.dispatchEvent(new window.Event('input'));const choice=doc.querySelector('.plan-library-choice input');choice.checked=true;choice.dispatchEvent(new window.Event('change'));
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('Add selected songs')).click();await tick();await tick();assert.equal(calls.at(-1).body.songs[0].folderUrl,'https://drive.google.com/drive/folders/song4');
 const manual=doc.querySelector('#plan form input[name="title"]');manual.value='Unwritten score';manual.focus();window.planTest.rerender();assert.equal(doc.querySelector('#plan form input[name="title"]').value,'Unwritten score');manual.closest('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();await tick();assert.equal(calls.at(-1).path,'/api/plan/add/1');
 [...doc.querySelectorAll('#plan button')].find(b=>b.textContent.includes('Back to lineup')).click();assert.ok(doc.querySelector('.plan-table').textContent.includes('Scores pending'));
 data.canManage=false;data.canChoose=false;window.planTest.member();assert.ok(doc.querySelector('tr[data-song-id="1"] th input').disabled);assert.equal(doc.querySelector('td[data-part="solo"] .plan-join'),null);assert.equal(doc.querySelectorAll('.plan-cell-add').length,0);
 doc.querySelector('tr[data-song-id="1"] td[data-part="bass"] .plan-join').click();await tick();await tick();assert.equal(calls.at(-1).body.part,'bass');
 doc.querySelector('tr[data-song-id="1"] td[data-part="tenor"] .plan-join').click();await tick();await tick();assert.ok(doc.querySelector('tr[data-song-id="1"] td[data-part="bass"] .plan-name'));assert.ok(doc.querySelector('tr[data-song-id="1"] td[data-part="tenor"] .plan-name'));
 doc.querySelector('tr[data-song-id="1"] td[data-part="bass"] .plan-remove').click();await tick();await tick();assert.equal(calls.at(-1).body.remove,true);assert.ok(doc.querySelector('tr[data-song-id="1"] td[data-part="tenor"] .plan-name'));assert.ok(!doc.querySelector('td[data-part="solo"] .plan-remove'));
 window.planTest.archive();assert.equal(doc.querySelectorAll('.plan-join,.plan-remove,.plan-cell-add').length,0);assert.doesNotMatch(body.textContent,/null/);
 console.log('PASS: independent bilingual entry, song/part roster orientation, Solo assignment, physical-semester library filtering, bulk checkbox selection, manual pending-score titles, cross-part multi-signup, isolated removal, draft preservation and archived read-only display.');
}finally{await window.happyDOM.abort();window.close();}
