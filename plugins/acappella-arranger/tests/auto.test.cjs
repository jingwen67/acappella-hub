const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {engine,bridge,Score,targets,E}=require('./chords.test.cjs');
function moduleLoad(name,imports) {
    const context={...imports};vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8').replace(/^\.(pragma|import).*$/gm,''),context);
    return context;
}
const analysis=moduleLoad('AutoHarmony.js',{Engine:engine});
const native=moduleLoad('AutoScore.js',{Engine:engine,Chords:bridge});
class Fixture extends Score {
    constructor(events=[]) {
        super(events);this.meta={};this.staves[0].part.longName='Solo';
        for(const staff of this.staves)staff.key=()=>0;
        this.tracks[0]=[this.chord(0,1920,60),this.chord(1920,3840,64),this.chord(3840,5760,67),this.chord(5760,7680,60)];
    }
    metaTag(key){return this.meta[key]||'';}
    setMetaTag(key,value){this.meta[key]=value;}
    doLayout() {
        for(const blocks of Object.values(this.tracks))for(const b of blocks)if(b.notes)for(const n of b.notes)
            if(n.play===undefined)n.play=true;
        for(const event of this.events)event.text=event.text.replace('maj7','M7');
    }
    segment(tick) {
        const segment=super.segment(tick),self=this;
        Object.defineProperty(segment,'annotations',{get(){
            return self.events.filter(e=>e.tick===tick).map(event=>{
                if(event.item)return event.item;
                const wrapper={type:E.harmony,track:(event.staff||0)*4,
                    get text(){return event.text},set text(v){event.text=v},
                    get color(){return event.color||'#000000'},set color(v){event.color=v}};
                return wrapper;
            });
        }});return segment;
    }
    newCursor() {
        const cursor=super.newCursor(),self=this;
        cursor.add=function(item){item.attached=true;item.track=this.staffIdx*4;self.events.push({tick:this.tick,staff:this.staffIdx,item,
            get text(){return item.text},set text(v){item.text=v}})};
        return cursor;
    }
    replace(track,start,end,pitch) {
        if(pitch!==null)return super.replace(track,start,end,pitch);
        this.writes++;if(this.writes===this.failAt)throw Error('simulated native write failure');
        const old=this.tracks[track]||[],overlap=old.filter(b=>b.start<end&&b.end>start);
        assert.equal(overlap.reduce((n,b)=>n+Math.min(end,b.end)-Math.max(start,b.start),0),end-start);
        const result=old.filter(b=>b.end<=start||b.start>=end);
        for(const b of overlap){
            if(b.type===E.chord)assert(b.start>=start&&b.end<=end,'clear escaped owned region');
            if(b.start<start)result.push(this.rest(b.start,start));
            if(b.end>end)result.push(this.rest(end,b.end));
        }
        result.push(this.rest(start,end));this.tracks[track]=result.sort((a,b)=>a.start-b.start);
    }
    startCmd(name) {
        super.startCmd(name);this.metaSnapshot=JSON.stringify(this.meta);
        this.eventsSnapshot=JSON.stringify(this.events.map(e=>({tick:e.tick,text:e.text,staff:e.staff||0,color:e.item?.color||e.color})));
    }
    endCmd(rollback){
        super.endCmd(rollback);
        if(rollback){this.events=JSON.parse(this.eventsSnapshot);}
    }
}
const fraction=t=>({ticks:t});
// Native Harmony TEXT setter requires an attached segment parent.
const newElement=type=>{
    let text='';return {type,color:'#000000',attached:false,
        get text(){return text},set text(value){assert(this.attached,'Harmony text set before segment attachment');text=value}};
};
function read(score){return native.read(score,E,-1,480,fraction);}
function run(score,path,variant=false){
    const data=read(score),chosen=bridge.targets(score).filter(t=>t.staff!==data.source);
    return native.execute(score,data,path||analysis.recommend(data,0)[0],chosen,E,480,fraction,newElement,variant);
}
let score=new Fixture(),data=read(score),choices=analysis.recommend(data,0);
assert(choices.length>=2);assert.equal(choices[0].minor,false);
assert(analysis.contains(choices[0].bars[0].chord,60));assert(analysis.contains(choices[0].bars[3].chord,60));
assert.notEqual(analysis.signature(choices[0]),analysis.signature(choices[1]));
const sourceBefore=JSON.stringify(score.tracks[0].map(b=>({start:b.start,end:b.end,pitch:b.notes[0].pitch})));
let result=run(score);assert(result.written>0);assert.equal(result.protectedCount,0);
assert.equal(JSON.stringify(score.tracks[0].map(b=>({start:b.start,end:b.end,pitch:b.notes[0].pitch}))),sourceBefore);
assert.deepEqual(score.commands,['start','commit']);
assert.equal(score.events.length,4);let meta=JSON.parse(score.meta.jingwenArrangement);assert.equal(meta.source,0);assert.equal(Object.keys(meta.bars).length,4);
// Repeat replaces owned material without duplicates. Local alternatives leave other bars unchanged.
run(score);assert.equal(score.events.length,4);
score.selection.selectRange(1920,3840,0,1);
const outsideBefore=native.fingerprint(native.tracks(score,[1,2,3,4],E,0,7680)[1],{start:3840,end:7680});
data=read(score);choices=analysis.recommend(data,0);const current=analysis.current(data,choices[0]);
const alternative=choices.find(p=>analysis.signature(p)!==analysis.signature(current));assert(alternative);
run(score,alternative);
assert.equal(native.fingerprint(native.tracks(score,[1,2,3,4],E,0,7680)[1],{start:3840,end:7680}),outsideBefore);
assert.equal(JSON.parse(score.meta.jingwenArrangement).bars[1920].chord,alternative.bars[0].label);
// Pitch/duration/color/lyrics/new voices and edited chord symbols protect the WHOLE bar.
for(const change of [
    s=>{s.tracks[4][0].notes[0].pitch++},
    s=>{s.tracks[4][0].notes[0].color='#123456'},
    s=>{s.tracks[4][0].stemDirection=1},
    s=>{s.tracks[4][0].lyrics=[{text:'manual'}]},
    s=>{s.tracks[5]=[s.chord(240,480,60)]},
    s=>{s.events[0].text='F#m7'},
    s=>{s.events[0].item.color='#123456'}
]) {
    const s=new Fixture();run(s);change(s);s.selection.selectRange(0,1920,0,1);
    const before=s.serialize(),events=JSON.stringify(s.events.map(e=>({tick:e.tick,text:e.text,color:e.item?.color||e.color})));
    const output=run(s);assert.equal(output.protectedCount,1);assert.equal(output.written,0);
    assert.equal(s.serialize(),before);assert.equal(JSON.stringify(s.events.map(e=>({tick:e.tick,text:e.text,color:e.item?.color||e.color}))),events);
}
score=new Fixture();score.tracks[4][0]=score.chord(0,1920,65);
result=run(score);assert.equal(result.protectedCount,1);assert.equal(score.tracks[4][0].notes[0].pitch,65);assert(!score.events.some(e=>e.tick===0));
score=new Fixture([{tick:0,text:'F'}]);result=run(score);assert.equal(score.events.length,1);assert.equal(score.events[0].text,'F');
assert(Object.values(JSON.parse(score.meta.jingwenArrangement).bars).every(b=>b.harmony===null));
score=new Fixture();score.failAt=3;const before=score.serialize();
assert.throws(()=>run(score),/simulated/);assert.equal(score.serialize(),before);
assert.equal(score.events.length,0);assert.equal(score.metaTag('jingwenArrangement'),'');assert.deepEqual(score.commands,['start','rollback']);
// Detect minor tonic, transposition, silence, partial selection snapping and fresh sources.
score=new Fixture();score.tracks[0]=[score.chord(0,1920,69),score.chord(1920,3840,72),score.chord(3840,5760,76),score.chord(5760,7680,69)];
assert.equal(analysis.recommend(read(score),0)[0].minor,true);
score=new Fixture();score.tracks[0]=[score.chord(0,1920,62),score.chord(1920,3840,66),score.chord(3840,5760,69),score.chord(5760,7680,62)];
score.staves.forEach(s=>s.key=()=>2);assert(analysis.contains(analysis.recommend(read(score),1)[0].bars[0].chord,62));
score=new Fixture();score.tracks[0][2]=score.rest(3840,5760);assert.equal(analysis.recommend(read(score),0)[0].bars[2].chord,null);
score=new Fixture();score.selection.selectRange(240,480,0,1);data=read(score);assert.equal(data.start,0);assert.equal(data.end,1920);assert.equal(data.bars[0].notes[0].end,1920);
score=new Fixture();score.selection.isRange=false;assert.equal(read(score).bars.length,4);
score=new Fixture();score.tracks[0]=[score.rest(0,7680)];assert.throws(()=>analysis.recommend(read(score),0),/没有音符/);
// A different source cannot overwrite an already owned bar, but separate Solo sections are supported.
score=new Fixture();run(score);data=native.read(score,E,1,480,fraction);
result=native.execute(score,data,analysis.recommend(data,0)[0],bridge.targets(score).filter(t=>t.staff!==1),E,480,fraction,newElement,false);
assert.equal(result.written,0);assert.equal(result.protectedCount,4);
score=new Fixture();score.staves[1].part.longName='Solo 2';
score.tracks[0]=[score.chord(0,1920,60),score.chord(1920,3840,64),score.rest(3840,7680)];
score.tracks[4]=[score.rest(0,3840),score.chord(3840,5760,67),score.chord(5760,7680,60)];
run(score);score.selection.selectRange(3840,7680,1,2);data=native.read(score,E,1,480,fraction);
result=native.execute(score,data,analysis.recommend(data,0)[0],bridge.targets(score).filter(t=>t.staff!==1),E,480,fraction,newElement,false);
assert(result.written>0);assert.equal(JSON.parse(score.meta.jingwenArrangement).bars[3840].source,1);
score.selection.selectRange(0,1920,0,1);assert.equal(read(score).source,0);
// Actual QML actions: generate, display alternatives, apply, stale preview guard.
const qml=fs.readFileSync(path.join(__dirname,'..','AcappellaTemplate.qml'),'utf8');
function body(name) {
    const start=qml.indexOf('    function '+name+'('),brace=qml.indexOf('{',start);
    let depth=1,end=brace+1;
    for(;depth;end++){if(qml[end]==='{')depth++;if(qml[end]==='}')depth--;}
    return qml.slice(start,end).trim();
}
function context(score) {
    const ctx={curScore:score,busy:false,rangeBusy:false,AutoScore:native,AutoHarmony:analysis,ChordEngine:engine,ChordScore:bridge,
        autoSource:{currentIndex:0},autoTonality:{currentIndex:0},autoStatus:{text:''},autoOptions:[],autoSnapshot:'',
        division:480,Segment:{All:99,ChordRest:1},Element:{HARMONY:3,CHORD:1,REST:2},
        fractionFromTicks:fraction,newElement,console:{log(){},error(){}}};
    ctx.root=ctx;vm.createContext(ctx);
    for(const name of ['autoRead','autoChoices','arrangeFromMelody'])vm.runInContext(body(name),ctx);
    return ctx;
}
score=new Fixture();let ctx=context(score);ctx.arrangeFromMelody(null);assert.equal(ctx.busy,false);assert.match(ctx.autoStatus.text,/已写入/);
score.selection.selectRange(0,1920,0,1);ctx.autoChoices();assert(ctx.autoOptions.length>=2);
ctx.arrangeFromMelody(ctx.autoOptions[0]);assert.match(ctx.autoStatus.text,/已写入/);
ctx.autoChoices();const option=ctx.autoOptions[0],count=score.commands.length;score.tracks[0][0].notes[0].pitch++;
ctx.arrangeFromMelody(option);assert.equal(score.commands.length,count);assert.match(ctx.autoStatus.text,/已变化/);
score=new Fixture();score.failAt=3;ctx=context(score);ctx.arrangeFromMelody(null);assert.equal(ctx.busy,false);
assert.deepEqual(score.commands,['start','rollback']);assert.match(ctx.autoStatus.text,/未完成/);
console.log('PASS: melody weighting, major/minor, unique full-phrase recommendations, generated symbols, untouched Solo, local alternatives, ownership/signature protection, user chord preservation, silent bars, selection snapping and complete failure rollback. Desktop MuseScore untested.');

// Native metadata survives undo; ownership follows score checkpoints instead.
const undone=new Fixture();run(undone);const generatedTracks=undone.tracks,generatedEvents=JSON.stringify(undone.events.map(e=>({tick:e.tick,text:e.text,staff:e.staff||0,color:e.item?.color||e.color})));
undone.endCmd(true);
assert.equal(Object.keys(read(undone).meta.bars).length,0);
undone.tracks=generatedTracks;undone.events=JSON.parse(generatedEvents);
assert.equal(Object.keys(read(undone).meta.bars).length,4);
undone.endCmd(true);
assert.equal(run(undone).protectedCount,0);
console.log('PASS undo/redo ownership with non-undoable native metadata.');

// Automatic arrangement must not depend on native selectRange changing selection.
const independent=new Fixture();independent.selection.isRange=false;
independent.selection.selectRange=()=>{throw Error('automatic generation must not mutate selection')};
assert(run(independent).written>0);
console.log('PASS automatic generation without native selection mutation.');

// General pop foundations: no calibration to the user's test song.
function musicalBar(pitches,index=0,fifths=0) {
    const start=index*1920,step=1920/pitches.length;
    return {start,end:start+1920,beat:480,number:index+1,fifths,
        notes:pitches.map((pitch,i)=>({pitch,start:start+i*step,end:start+(i+1)*step}))};
}
const passing={start:0,end:1920,beat:480,fifths:0,notes:[
    {pitch:60,start:0,end:240},{pitch:62,start:240,end:480},{pitch:64,start:480,end:1920}]};
assert.equal(analysis.embellishment(passing.notes,1,engine.parse('C'),passing),true);
assert.equal(analysis.localScore(passing,engine.parse('C')),2);
const accented={...passing,notes:[{pitch:60,start:0,end:480},{pitch:62,start:480,end:960},{pitch:64,start:960,end:1920}]};
assert.equal(analysis.embellishment(accented.notes,1,engine.parse('C'),accented),false);
assert(analysis.localScore(accented,engine.parse('C'))<2);
const pop={bars:[[67,71,74],[69,72,76],[65,69,72],[60,64,67]].map((p,i)=>musicalBar(p,i))};
assert.equal(analysis.recommend(pop,1)[0].bars.map(b=>b.label).join(','),'G,Am,F,C');
assert.equal(analysis.recommend({bars:[musicalBar([67,71,74])]},1)[0].bars[0].label,'G');
assert.equal(analysis.recommend({bars:[musicalBar([60,64,67])]},1)[0].bars[0].label,'C');
for(const minor of [false,true])for(let fifths=-7;fifths<=7;fifths++) {
    const key=engine.keyInfo(fifths,minor),chord=engine.degreeChord('1',key),bar=musicalBar(chord.tones.map(t=>60+t.pc),0,fifths);
    const suggestions=analysis.recommend({bars:[bar]},minor?2:1);
    assert(suggestions.length);assert(suggestions[0].bars[0].chord.tones.length===3);
    assert(!analysis.candidates(bar,minor).some(c=>c.chord.tones.length>3));
}
const modal={bars:[[69,72,76],[65,69,72],[60,64,67],[67,71,74]].map((p,i)=>musicalBar(p,i))};
assert.equal(analysis.recommend(modal,2)[0].bars.map(b=>b.label).join(','),'Am,F,C,G');
console.log('PASS weak passing-tone interpretation, accented-tone distinction, rotated pop loops, minor loops, open dominant ending, triad defaults and all key signatures.');

const compound=new Fixture();let measure=compound.firstMeasure;
while(measure){measure.timesigNominal={numerator:6,denominator:8};measure=measure.nextMeasure;}
assert.equal(read(compound).bars[0].beat,720);
console.log('PASS compound-meter structural beats.');
