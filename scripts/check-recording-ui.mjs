import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('    let captureSession = null'),html.indexOf('    function candidateCard'));
let stopped=0,revoked=0,deny=false,rendered=0,banner='',puts=0;
const calls=[];
class Recorder {
 static isTypeSupported(type){return type==='audio/mp4';}
 constructor(stream,options){this.mimeType=options.mimeType;this.state='inactive';this.options=options;}
 start(timeslice){this.state='recording';this.timeslice=timeslice;}
 stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'],{type:this.mimeType})});this.onstop();}
}
const context={Blob,MediaRecorder:Recorder,window:{MediaRecorder:Recorder,addEventListener(){},confirm:()=>true},navigator:{mediaDevices:{async getUserMedia(){if(deny)throw Error('denied');return {getTracks:()=>[{stop(){stopped++;}}]};}}},
 URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL(){revoked++;}},document:{querySelectorAll:()=>[]},
 el:(tag,attrs,...children)=>({tag,attrs,children}),both:key=>key,pair:(a,b)=>a+' / '+b,
 showBanner:msg=>{banner=msg;},latest:{},renderRound:()=>{rendered++;},
 run:fn=>fn(),api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return path.endsWith('/complete')?{saved:true}:{id:'clip',signedUrl:'https://storage.test/upload'};},
 fetch:async(url,options)=>{assert.equal(options.method,'PUT');assert.equal(options.credentials,'omit');assert.equal(options.headers['Content-Type'],'audio/mp4');assert.ok(options.body instanceof Blob);puts++;return {ok:true};}};
vm.createContext(context);vm.runInContext('let freezeRender=false;'+source,context);
await vm.runInContext('startCapture({id:7},{candidateId:3})',context);
assert.equal(vm.runInContext('captureSession.status',context),'recording');
assert.equal(vm.runInContext('captureSession.recorder.mimeType',context),'audio/mp4');
assert.equal(vm.runInContext('captureSession.recorder.timeslice',context),1000);
vm.runInContext('captureSession.recorder.stop()',context);
assert.equal(vm.runInContext('captureSession.status',context),'preview');assert.equal(stopped,1);
await vm.runInContext('saveRecording({id:7},{candidateId:3},captureSession.blob)',context);
assert.equal(puts,1);assert.equal(calls[0].path,'/api/phases/7/recordings');assert.equal(calls[0].body.candidateId,3);assert.equal(calls[1].path,'/api/recordings/clip/complete');assert.equal(vm.runInContext('captureSession',context),null);assert.equal(revoked,1);
deny=true;await vm.runInContext('startCapture({id:7},{candidateId:3})',context);assert.equal(banner,'microphone_denied');assert.equal(vm.runInContext('freezeRender',context),false);
deny=false;await vm.runInContext('startCapture({id:7},{entryId:9})',context);vm.runInContext('disposeCapture()',context);assert.equal(vm.runInContext('captureSession',context),null);assert.ok(stopped>=3);
assert.equal(vm.runInContext("audioMime({type:'audio/x-m4a'})",context),'audio/mp4');assert.equal(vm.runInContext("audioMime({type:'',name:'clip.mp3'})",context),'audio/mpeg');
assert.ok(rendered>=5);
console.log('PASS: MP4 fallback, recording/stop/preview, microphone release, private direct upload, save completion, denied permissions, navigation cleanup, and upload MIME normalization.');
