const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','CreateFlow.js'),'utf8').replace(/^\.pragma.*$/gm,'');
const flow={};vm.createContext(flow);vm.runInContext(source,flow);
let order=[],window={visible:true};
flow.run(window,()=>{order.push('close');window.visible=false},()=>{assert.equal(window.visible,false);order.push('create');return true},{},()=>{},()=>{order.push('notation');return true});
assert.deepEqual(order,['close','create','notation']);
order=[];window={visible:true};assert.throws(()=>flow.run(window,()=>{},()=>{order.push('create');return true},{},()=>{},()=>{order.push('notation');return true}),/尚未关闭/);assert.deepEqual(order,[]);
window={visible:true};assert.throws(()=>flow.run(window,()=>{window.visible=false},()=>false,{},()=>{},()=>{throw Error('must not navigate')}),/未能/);
window={visible:true};assert.throws(()=>flow.run(window,()=>{window.visible=false},()=>true,{},()=>{},()=>false),/新谱已创建/);
const qml=fs.readFileSync(path.join(__dirname,'..','AcappellaTemplate.qml'),'utf8'),begin=qml.indexOf('    function createTemplate()'),end=qml.indexOf('    TabBar',begin);
order=[];window={visible:true};
const context={busy:false,rangeBusy:false,mscoreMajorVersion:4,mscoreMinorVersion:7,
    scoreTitle:{text:'New Song'},arranger:{text:''},bars:{value:4},meters:{currentText:'4/4'},keys:{currentIndex:7},tempo:{value:100},
    solo:{checked:true},soprano:{checked:true},alto:{checked:true},tenor:{checked:true},baritone:{checked:true},bass:{checked:true},beatbox:{checked:true},rap:{checked:false},
    soloSettings:()=>[{clef:'treble'}],Template:{build(){},buildNative(){return '<museScore/>'}},
    templateFile:{tempPath:()=>'/tmp',exists:()=>false,write:()=>true},nativeModel:null,
    Qt:{createQmlObject(){return {createScore(info){assert.equal(window.visible,false);assert.equal(info.title,'New Song');order.push('create');return true}}}},
    Window:{window},quit(){order.push('close');window.visible=false},status:{text:''},CreateFlow:flow,
    api:{launcher:{open(uri){assert.equal(uri,'musescore://notation');order.push('notation');return true}}},
    console:{log(){},error(){}},creationError:{open(){throw Error('unexpected error dialog')}}};
context.root=context;vm.createContext(context);vm.runInContext(qml.slice(begin,end),context);context.createTemplate();
assert.deepEqual(order,['close','create','notation']);
console.log('PASS close/create/navigate order, failed creation never navigates, synchronous native QML handler and application-owned launcher. Real desktop switching untested.');
