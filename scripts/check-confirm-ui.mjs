import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const html=fs.readFileSync('public/index.html','utf8');
const window=new Window();
try{
 window.eval(`let freezeRender=false;const t=x=>x,pair=(a,b)=>a+' / '+b;function el(tag,attrs,...children){const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs||{})){if(k.startsWith('on'))n[k]=v;else n.setAttribute(k,v);}for(const child of children.flat()){if(child!=null)n.append(child);}return n;}window.actions=[];`+html.slice(html.indexOf('    function inlineConfirmation'),html.indexOf('    function pollTypeLabel'))+';window.readFrozen=()=>freezeRender;');
 window.confirm=()=>{throw Error('Native confirmation must not be used');};
 window.eval(`document.body.append(duetCloseControl({id:1},name=>window.actions.push(name)));`);
 const open=window.document.querySelector('button');open.click();open.click();assert.equal(window.document.querySelectorAll('.confirm').length,1);assert.deepEqual(Array.from(window.actions),[]);
 window.document.querySelector('.confirm .ghost').click();assert.equal(window.document.querySelector('.confirm'),null);assert.equal(window.readFrozen(),false);assert.deepEqual(Array.from(window.actions),[]);
 open.click();const confirm=window.document.querySelector('.confirm .primary');confirm.click();confirm.click();assert.deepEqual(Array.from(window.actions),['close']);assert.equal(window.readFrozen(),false);
 window.eval(`requestInlineConfirmation(document.querySelector('button'),'Delete?',()=>window.actions.push('delete'));`);assert.deepEqual(Array.from(window.actions),['close']);window.document.querySelector('.inline-confirmation .primary').click();assert.deepEqual(Array.from(window.actions),['close','delete']);
 for(const file of ['public/index.html','public/plan.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\b(?:window\.)?confirm\s*\(/);
 console.log('PASS: page confirmations defer actions, cancel safely, prevent duplicate submits, resume refresh and avoid all native confirmation dialogs.');
}finally{await window.happyDOM.close();}
