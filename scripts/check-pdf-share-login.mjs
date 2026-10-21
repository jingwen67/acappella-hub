import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const html=fs.readFileSync('public/index.html','utf8'),main=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const loading'))[1];
const state=JSON.parse(fs.readFileSync('/tmp/plan-state.json','utf8'));state.uiVersion='';state.phase=null;
const target='/pdf.html?folderId=scoreFolder123&fileId=latestPdfFile123';
const tick=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));};
for(const [next,signedIn,expected] of [[target,false,target],[target,true,target],['https://evil.test/pdf.html?folderId=scoreFolder123',true,''],['//evil.test/pdf.html?folderId=scoreFolder123',true,''],['/api/admin/users',true,'']]){
 const window=new Window({url:'https://hub.test/?next='+encodeURIComponent(next),settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 try{const redirects=[];window.location.replace=url=>redirects.push(url);window.document.write(html.replace(/<script[\s\S]*?<\/script>/g,''));window.fetch=async url=>{if(url==='/api/state'&&!signedIn)return {ok:false,status:401};return {ok:true,status:200,json:async()=>structuredClone(url==='/api/state'||url==='/api/login'?state:{songs:[]})};};window.eval(fs.readFileSync('public/plan.js','utf8')+'\n'+main);await tick();if(!signedIn){assert.equal(window.document.querySelector('#auth').hidden,false);assert.equal(redirects.length,0);window.document.querySelector('#auth-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();}if(expected)assert.ok(redirects.includes(expected));else assert.equal(redirects.length,0);}finally{await window.happyDOM.close();}
}
const reader=new Window({url:'https://hub.test'+target,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
try{const redirects=[];reader.location.replace=url=>redirects.push(url);reader.document.write(fs.readFileSync('public/pdf.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));reader.fetch=async()=>({ok:false,status:401,json:async()=>({error:'login_required'})});reader.eval(fs.readFileSync('public/pdf-viewer.mjs','utf8'));await tick();assert.equal(redirects.length,1);const login=new URL(redirects[0]);assert.equal(login.origin,'https://hub.test');assert.equal(login.searchParams.get('next'),target);}finally{await reader.happyDOM.close();}
console.log('PASS: private PDF links redirect to login then back to the selected PDF; authenticated links open directly and external redirect targets are rejected.');
