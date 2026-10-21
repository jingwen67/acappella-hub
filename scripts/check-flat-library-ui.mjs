import fs from 'node:fs';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
const state=JSON.parse(fs.readFileSync(process.env.PLAN_UI_FIXTURE||'/tmp/plan-state.json','utf8'));
state.uiVersion='';state.phase=null;state.history=[];state.admin=null;state.user={...state.user,isAdmin:true,isMd:true,isArranger:true};
state.library={flat:true,ready:true,semesters:[{id:2,label:'乐谱库'}],arrangers:[],setup:{connected:true,email:'test@example.test',hasClient:true,clientId:'test',spreadsheetId:'test',parentFolderId:'rootlibrary12345'}};
const calls=[],errors=[],window=new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
try{
 window.addEventListener('error',event=>errors.push(event.message));window.document.write(fs.readFileSync('public/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 window.fetch=async(url,options={})=>{const parsed=new URL(url,'http://localhost');calls.push({path:parsed.pathname,method:options.method||'GET'});let data={invitations:[]};if(parsed.pathname==='/api/state')data=state;else if(parsed.pathname==='/api/library/folders')data={id:'all',folders:[{id:'folder1234567',name:'Song',url:'https://drive.google.com/drive/folders/folder1234567'}]};else if(parsed.pathname==='/api/library/sync')data={added:3,linked:0};else if(parsed.pathname==='/api/plan/poll-songs')data={songs:[]};return {ok:true,json:async()=>structuredClone(data)};};
 const html=fs.readFileSync('public/index.html','utf8'),main=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const loading'))[1];window.eval(fs.readFileSync('public/plan.js','utf8')+'\n'+main);
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));await tick();await tick();const doc=window.document;
 doc.querySelector('#open-scores').click();doc.querySelector('#open-score-search').click();await tick();await tick();assert.equal(doc.querySelector('#browse-semester').closest('label').hidden,true);assert.ok(doc.querySelector('#browse-folders').textContent.includes('Song'));
 doc.querySelector('#scores-back').click();doc.querySelector('#open-score-upload').click();await tick();
 assert.equal(doc.querySelector('#new-song-semester').hidden,true);assert.equal(doc.querySelector('#semester-form').hidden,true);assert.equal(doc.querySelector('#semester-list').hidden,true);
 const sync=[...doc.querySelectorAll('#google-connect button')].find(button=>button.textContent.includes('同步 Drive'));assert.ok(sync);sync.click();await tick();await tick();assert.equal(calls.filter(item=>item.path==='/api/library/sync'&&item.method==='POST').length,1);assert.ok(doc.body.textContent.includes('新增 3 首'));assert.equal(sync.disabled,false);assert.deepEqual(errors,[]);
 console.log('PASS: flat library UI hides semester selectors and setup, browses root songs, and syncs through an explicit button with visible confirmation.');
}finally{window.happyDOM.abort();window.close();}
