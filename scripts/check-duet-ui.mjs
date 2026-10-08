import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const html=fs.readFileSync('public/index.html','utf8');
for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))parse(match[1]);
const el=(tag,attrs,...children)=>({tag,attrs,children:children.flat().filter(x=>x!=null&&x!==false)});
const find=(nodes,predicate)=>{for(const n of nodes){if(n&&typeof n==='object'){if(predicate(n))return n;const found=find(n.children||[],predicate);if(found)return found;}}};
const calls=[];
const context={el,t:key=>key,pair:(zh,en)=>zh+' / '+en,both:key=>key,avatarNode:person=>el('img',{src:person.avatar||''}),
 window:{confirm:()=>true},api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});},run:fn=>fn(),
 resultsToggle:()=>el('button',{},'details'),candidateCard:()=>null,runningLine:()=>'',formatTime:()=>'',scoreLine:()=>'',
 FormData:class{constructor(form){this.fields=form.fields;}get(key){return this.fields[key]??null;}},
 round:{replaceChildren(){this.nodes=[];},append(...nodes){this.nodes.push(...nodes);}},
 history:{replaceChildren(){this.nodes=[];},append(...nodes){this.nodes.push(...nodes);}}};
vm.createContext(context);
vm.runInContext('const detailedResults=new Set();'+html.slice(html.indexOf('    function pollTypeLabel'),html.indexOf('    let editingRoster')),context);
const members=[{id:1,name:'One',isArranger:true},{id:2,name:'Two'},{id:3,name:'Three'}];
context.data={user:{id:1,isMd:true},members,phase:null};vm.runInContext('renderRound(data)',context);
const methodSelect=find(context.round.nodes,n=>n.tag==='select'&&n.attrs.name==='votingMode');assert.deepEqual(methodSelect.children.map(n=>n.attrs.value),['default','feedback','pair','parts']);
const form=find(context.round.nodes,n=>n.tag==='form');await form.attrs.onsubmit({preventDefault(){},target:{fields:{title:'Duet',votingMode:'parts',arrangerId:'1',partA:'High',partB:'Low'}}});assert.equal(calls.at(-1).body.pollType,'parts');assert.equal(calls.at(-1).body.votingMode,'default');assert.equal(calls.at(-1).body.partA,'High');
const entry=(id,part,person)=>({id,part,name:person.name,members:[person],isMe:person.id===1,mine:null});
context.data.phase={id:10,pollType:'parts',title:'Parts',partA:'High',partB:'Low',started:false,partLocks:{},voteLimits:{A:2,B:2},candidates:[],pendingPairs:[]};vm.runInContext('renderRound(data)',context);
const partForm=find(context.round.nodes,n=>n.tag==='form');await partForm.attrs.onsubmit({preventDefault(){},target:{fields:{part:'B'}}});assert.deepEqual(calls.at(-1),{path:'/api/phases/10/candidacy',body:{join:true,part:'B'}});
context.data.phase={id:11,pollType:'pair',title:'Pairs',started:false,registrationLocked:false,candidates:[],pendingPairs:[{...entry(25,'pair',members[1]),members:members.slice(0,2),canConfirm:true}]};vm.runInContext('renderRound(data)',context);
const confirm=find(context.round.nodes,n=>n.tag==='button'&&n.children.includes('确认组队 / Confirm pair'));await confirm.attrs.onclick();assert.deepEqual(calls.at(-1),{path:'/api/phases/11/confirm',body:{entryId:25}});
context.data.phase={id:12,pollType:'parts',title:'Parts',partA:'High',partB:'Low',started:true,partLocks:{A:true,B:true},voteLimits:{A:1,B:1},candidates:[entry(30,'A',members[0]),entry(31,'B',members[1])],pendingPairs:[]};vm.runInContext('renderRound(data)',context);
assert.equal(find(context.round.nodes,n=>n.tag==='button'&&n.children.includes('退出参选 / Withdraw')).attrs.disabled,true);
context.results=[{id:12,pollType:'parts',title:'Parts',partA:'High',partB:'Low',votingMode:'default',revealedRanks:2,canReveal:true,canSeeResults:false,candidates:[{...entry(30,'A',members[0]),rank:1},{...entry(31,'B',members[1]),rank:1}]}];vm.runInContext('renderHistory(results)',context);
assert.equal(find(context.history.nodes,n=>n.tag==='h4'&&n.children.includes('High')).tag,'h4');assert.equal(find(context.history.nodes,n=>n.tag==='h4'&&n.children.includes('Low')).tag,'h4');
console.log('PASS: four bilingual voting methods, creation payload, per-part signup, partner confirmation, locked withdrawal UI, and separately grouped duet results.');
