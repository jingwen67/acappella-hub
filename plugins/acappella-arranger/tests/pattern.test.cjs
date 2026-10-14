const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {Score,E}=require('./score-fixture.cjs');
function load(name,imports={}){const c={...imports};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8').replace(/^\.(pragma|import).*$/gm,''),c);return c;}
const music=load('BassVoicing.js'),writer=load('BassWrite.js',{Engine:music}),bass=load('BassScore.js',{Music:music,Writer:writer}),pattern=load('PatternScore.js',{Music:music,Writer:writer,Bass:bass});
const fraction=t=>({ticks:t}),targets=['soprano','alto','tenor','baritone'].map((profile,staff)=>({staff,profile}));
function crossingCheck(plan,bassNotes){for(const n of plan.notes){for(const b of bassNotes)if(n.tick<b.end && n.end>b.start)assert(n.pitch>b.pitch,'generated part fell at/below Bass');
    for(const other of plan.notes)if(n.staff<other.staff && n.tick<other.end && n.end>other.tick)assert(n.pitch>other.pitch,'generated voice overlap');}}
let plan=music.plan({start:0,end:1920,events:[{tick:0,text:'C'}],rests:Object.fromEntries(targets.map(t=>[t.staff,[{start:0,end:1920}]])),bass:[{start:0,end:1920,pitch:55}]},targets,480);
crossingCheck(plan,[{start:0,end:1920,pitch:55}]);
assert.throws(()=>music.plan({start:0,end:1920,events:[{tick:0,text:'C'}],rests:Object.fromEntries(targets.map(t=>[t.staff,[{start:0,end:1920}]])),bass:[{start:0,end:1920,pitch:65}]},targets,480),/交叉/);
class Fixture extends Score {
    constructor(){super([{tick:0,text:'C',staff:4},{tick:1920,text:'F',staff:4},{tick:3840,text:'Am',staff:4},{tick:4800,text:'Dm',staff:4},{tick:5760,text:'G7',staff:4}]);
        this.staves.forEach(s=>s.key=()=>0);
        this.tracks[0]=[this.chord(0,480,64),this.rest(480,960),this.chord(960,1440,67),this.rest(1440,1920),this.rest(1920,2160),this.chord(2160,2640,65),this.rest(2640,3840),this.rest(3840,5760),this.rest(5760,7680)];
        this.tracks[4]=[this.chord(0,960,60),this.rest(960,1920),this.chord(1920,2880,60),this.rest(2880,3840),this.rest(3840,5760),this.rest(5760,7680)];
        this.tracks[16]=[this.chord(0,1920,48),this.chord(1920,3840,41),this.chord(3840,4800,45),this.chord(4800,5760,50),this.chord(5760,7680,43)];
        this.selection.selectRange(0,3840,0,4);
    }
}
let score=new Fixture(),template=pattern.capture(score,E,-1,-2,480,fraction);assert.equal(template.bars.length,2);assert.equal(template.targets.length,2);
const originalSource=score.serialize(),bassBefore=score.tracks[16],sourceShapes=JSON.stringify([template.patterns[0],template.patterns[1]]);
let output=pattern.generate(score,template,E,480,fraction);assert(output.written>0);assert.deepEqual(score.commands,['start','commit']);assert.equal(score.tracks[16],bassBefore);
assert.equal(JSON.stringify(pattern.capture(score,E,-1,-2,480,fraction,{start:0,end:3840}).patterns),JSON.stringify(template.patterns));
const generated=score.tracks[0].filter(n=>n.type===E.chord && n.start>=3840);
assert.deepEqual(generated.map(n=>[n.start,n.end]),[[3840,4320],[4800,5280],[6000,6480]]);
assert.equal(score.tracks[8].filter(n=>n.type===E.chord).length,0,'parts without examples must be left blank');
for(const staff of [0,1])for(const n of score.tracks[staff*4].filter(n=>n.type===E.chord && n.start>=3840)) {
    const chord=pattern.chordAt(score.events,n.start);
    assert(chord.tones.some(t=>t.pc===music.mod(n.notes[0].pitch)));
    for(const b of score.tracks[16])if(n.start<b.end && n.end>b.start)assert(n.notes[0].pitch>b.notes[0].pitch);
}
assert.throws(()=>pattern.generate(score,template,E,480,fraction),/没有可写入/);
score=new Fixture();template=pattern.capture(score,E,-1,-2,480,fraction);score.tracks[0][0].end=240;score.tracks[0][0].actualDuration.ticks=240;assert.throws(()=>pattern.generate(score,template,E,480,fraction),/样例节奏已变化/);
score=new Fixture();template=pattern.capture(score,E,-1,-2,480,fraction);score.tracks[1]=[score.chord(3840,5760,72)];pattern.generate(score,template,E,480,fraction);assert.equal(score.tracks[1][0].notes[0].pitch,72);assert.equal(score.tracks[0].find(n=>n.start===3840).type,E.rest);
score=new Fixture();template=pattern.capture(score,E,-1,-2,480,fraction);score.failAt=2;const before=score.serialize();assert.throws(()=>pattern.generate(score,template,E,480,fraction),/simulated/);assert.equal(score.serialize(),before);assert.deepEqual(score.commands,['start','rollback']);
score=new Fixture();score.events=[];template=pattern.capture(score,E,-1,-2,480,fraction);assert.throws(()=>pattern.generate(score,template,E,480,fraction),/缺少 Bass 和弦/);assert.equal(score.commands.length,0);
score=new Fixture();template=pattern.capture(score,E,-1,-2,480,fraction);score.firstMeasure.nextMeasure.nextMeasure.timesigNominal={numerator:3,denominator:4};assert.throws(()=>pattern.generate(score,template,E,480,fraction),/拍号/);
score=new Fixture();template=pattern.capture(score,E,-1,-2,480,fraction);score.selection.selectRange(5760,7680,0,4);pattern.generate(score,template,E,480,fraction);assert.equal(score.tracks[0].find(n=>n.start===3840).type,E.rest);
console.log('PASS strict actual-Bass floor, voice separation, impossible register refusal, per-part two-bar rhythm cycling, rests, harmony changes, sample/Bass preservation, blank-only writes, all voices, stale samples, missing chords, meter mismatch, target selection and rollback. Desktop MuseScore untested.');
// A held rhythm note is split where the harmony changes; do not copy sample pitches.
const heldTemplate={length:1920,targets:[{staff:0,profile:'soprano'}],patterns:{0:[{offset:0,length:1440}]}};
const heldData={start:0,end:1920,events:[{tick:0,text:'C'},{tick:960,text:'Dm'}],bass:[{start:0,end:960,pitch:48},{start:960,end:1920,pitch:50}],solo:[],fixed:[],rests:{0:[{start:0,end:480},{start:480,end:960},{start:960,end:1920}]}};
plan=pattern.makePlan(heldData,heldTemplate,480);assert(plan.notes.some(n=>n.tick===960));assert(plan.notes.every(n=>n.end<=1440));crossingCheck(plan,heldData.bass);
const qml=fs.readFileSync(path.join(__dirname,'..','AcappellaTemplate.qml'),'utf8'),begin=qml.indexOf('    function rememberPattern()'),end=qml.indexOf('    ScrollView {',begin);
const ui={curScore:new Fixture(),busy:false,rangeBusy:false,rhythmTemplate:null,PatternScore:pattern,division:480,
    Element:{CHORD:E.chord,REST:E.rest,HARMONY:E.harmony},Segment:{All:E.all,ChordRest:E.chordRest},
    bassSource:{currentIndex:0},soloSource:{currentIndex:1},patternStatus:{text:''},fractionFromTicks:fraction};
ui.root=ui;vm.createContext(ui);vm.runInContext(qml.slice(begin,end),ui);ui.rememberPattern();assert(ui.rhythmTemplate);ui.fillPattern();assert.match(ui.patternStatus.text,/已补全/);assert.equal(ui.busy,false);
ui.curScore=new Fixture();ui.curScore.selection.isRange=false;ui.rememberPattern();assert.equal(ui.rhythmTemplate,null);assert.match(ui.patternStatus.text,/范围/);assert.equal(ui.busy,false);
console.log('PASS mid-note chord change, adjacent rests, actual QML sample capture/fill and failure cleanup.');
// Chord-only preparation leaves all existing notes exactly unchanged.
class SymbolFixture extends Fixture {
    newCursor(){const c=super.newCursor(),self=this;c.add=function(item){item.attached=true;item.track=this.staffIdx*4;self.events.push({tick:this.tick,staff:this.staffIdx,get text(){return item.text}})};return c;}
}
score=new SymbolFixture();score.events=[];score.tracks[16].forEach((n,i)=>{n.notes[0].tpc=[14,13,17,16,15][i]});const unchanged=score.serialize(),bassData=bass.read(score,E,-1,-2,480,fraction);
const harmony=load('BassHarmony.js',{Music:music}),slots=harmony.analyze(bassData,false,480);
const symbolResult=bass.generate(score,bassData,slots,slots.map(()=>0),E,480,fraction,type=>{let text='';return {type,attached:false,get text(){return text},set text(v){assert(this.attached);text=v}}},true);
assert(symbolResult.symbolCount>0);assert.equal(score.serialize(),unchanged);assert.equal(symbolResult.written,0);
console.log('PASS chord-only preparation preserves all notes.');
