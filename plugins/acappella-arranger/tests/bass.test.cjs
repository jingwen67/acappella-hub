const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {Score,E}=require('./score-fixture.cjs');
function load(name,imports={}){const c={...imports};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8').replace(/^\.(pragma|import).*$/gm,''),c);return c;}
const music=load('BassVoicing.js'),writer=load('BassWrite.js',{Engine:music}),harmony=load('BassHarmony.js',{Music:music}),native=load('BassScore.js',{Music:music,Writer:writer,Harmony:harmony});
function bar(n=4,d=4){return {start:0,end:480*4*n/d,number:1,numerator:n,denominator:d,unit:480*4/d,fifths:0};}
function bass(start,end,pitch,letter=0){return {start,end,pitch,letter};}
function data(b,measure=bar(),solo=[]){return {start:0,end:measure.end,bass:b,measures:[measure],solo};}
let slots=harmony.analyze(data([bass(0,960,48),bass(960,1920,43,4)]),false,480);
assert.equal(slots.length,2);assert.equal(slots[1].start,960);assert.equal(slots[0].choices[0].label,'C');assert.equal(slots[1].choices[0].label,'G');
assert(harmony.strong(bar(),0));assert(harmony.strong(bar(),960));assert(!harmony.strong(bar(),480));
assert(harmony.strong(bar(6,8),720));assert(!harmony.strong(bar(6,8),240));
assert(!harmony.strong(bar(3,4),960));
slots=harmony.analyze(data([bass(0,720,48),bass(720,1440,43,4)],bar(6,8)),false,480);assert.equal(slots[1].start,720);
slots=harmony.analyze(data([bass(0,240,48),bass(240,480,50,1),bass(480,1920,52,2)]),false,480);
assert(!slots.some(s=>s.start===240),'weak passing bass should not introduce a chord');
slots=harmony.analyze(data([bass(0,480,48),bass(480,960,50,1),bass(960,1920,52,2)]),false,480);
assert(slots.some(s=>s.start===480),'beat two may change chord');
slots=harmony.analyze(data([bass(0,480,48),bass(960,1920,43,4)]),false,480);assert.equal(slots[0].end,480);
slots=harmony.analyze(data([bass(0,1920,52,2)],bar(),[{start:0,end:1920,pitch:60}]),false,480);
assert.equal(slots[0].choices[0].label,'C/E');assert(slots[0].choices.some(c=>c.label==='Am/E'));
slots=harmony.analyze(data([bass(0,1920,43,4)],bar(),[{start:0,end:1920,pitch:65}]),false,480);assert.equal(slots[0].choices[0].label,'G7');
for(const minor of [false,true])for(let fifths=-7;fifths<=7;fifths++) {
    const key=music.keyInfo(fifths,minor),measure={...bar(),fifths};
    const suggestions=harmony.analyze(data([bass(0,1920,36+key.pc,key.letter)],measure),minor,480);
    assert(suggestions[0].choices.length);
    for(const c of suggestions[0].choices)assert.equal(music.parse(c.label).bass.pc,key.pc);
}
class Fixture extends Score {
    constructor(){super([]);this.staves.forEach(s=>s.key=()=>0);this.tracks[16]=[this.chord(0,960,48),this.chord(960,1920,43),this.rest(1920,7680)];
        this.tracks[16][0].notes[0].tpc=14;this.tracks[16][1].notes[0].tpc=15;
    }
    newCursor(){const c=super.newCursor(),self=this;c.add=function(item){item.attached=true;item.track=this.staffIdx*4;self.events.push({tick:this.tick,staff:this.staffIdx,item,get text(){return item.text}})};return c;}
    startCmd(){super.startCmd();this.originalEvents=this.events.slice();}
    endCmd(rollback){super.endCmd(rollback);if(rollback)this.events=this.originalEvents;}
}
const fraction=t=>({ticks:t}),newElement=type=>{let text='';return {type,attached:false,get text(){return text},set text(v){assert(this.attached);text=v}}};
function generate(s){const d=native.read(s,E,-1,-2,480,fraction),rows=harmony.analyze(d,false,480);return native.generate(s,d,rows,rows.map(()=>0),E,480,fraction,newElement);}
let score=new Fixture();const original=JSON.stringify(score.tracks[16].map(n=>({start:n.start,end:n.end,pitch:n.notes?.[0].pitch})));
let result=generate(score);assert(result.written>0);assert.deepEqual(score.commands,['start','commit']);
assert.equal(JSON.stringify(score.tracks[16].map(n=>({start:n.start,end:n.end,pitch:n.notes?.[0].pitch}))),original);
assert(score.tracks[0].some(n=>n.start===960 && n.type===E.chord));assert.equal(score.events.length,2);
assert.throws(()=>generate(score),/空白/);
score=new Fixture();score.tracks[1]=[score.chord(0,1920,72)];generate(score);assert.equal(score.tracks[1][0].notes[0].pitch,72);assert.equal(score.tracks[0][0].type,E.rest);
score=new Fixture();score.failAt=2;const before=score.serialize();assert.throws(()=>generate(score),/simulated/);assert.equal(score.serialize(),before);assert.equal(score.events.length,0);assert.deepEqual(score.commands,['start','rollback']);
score=new Fixture();score.selection.selectRange(960,1920,0,1);generate(score);assert.equal(score.tracks[0][0].type,E.rest);assert(score.tracks[0].some(n=>n.start===960 && n.type===E.chord));
score=new Fixture();score.tracks[16][0].tuplet=true;assert.throws(()=>native.read(score,E,-1,-2,480,fraction),/连音/);
console.log('PASS bass subdivision, 4/4 third beat, 6/8 groups, weak passing versus beat-two changes, rests, inversion candidates, melody-supported V7, all keys, safe empty-only writing, all voices, selection, attach-before-text and transaction rollback. Desktop MuseScore untested.');

// Exercise the shipped QML handlers, including stale source protection.
const qml=fs.readFileSync(path.join(__dirname,'..','AcappellaTemplate.qml'),'utf8');
const begin=qml.indexOf('    function refreshBassSources()'),end=qml.indexOf('    ScrollView {',begin);
const list={items:[],get count(){return this.items.length},clear(){this.items=[]},append(item){this.items.push(item)},get(i){return this.items[i]}};
const ui={curScore:new Fixture(),division:480,Element:{CHORD:E.chord,REST:E.rest,HARMONY:E.harmony},Segment:{ChordRest:E.chordRest},
    BassScore:native,BassHarmony:harmony,busy:false,rangeBusy:false,bassSources:[],bassSlots:[],bassSnapshot:'',bassRows:list,
    bassSource:{currentIndex:0},soloSource:{currentIndex:1},bassMode:{currentIndex:0},bassStatus:{text:''},fractionFromTicks:fraction,newElement};
ui.root=ui;vm.createContext(ui);vm.runInContext(qml.slice(begin,end),ui);
ui.analyzeBass();assert(list.count>0);assert.equal(ui.busy,false);ui.generateBassHarmony();assert.match(ui.bassStatus.text,/已写入/);
ui.curScore=new Fixture();ui.analyzeBass();ui.curScore.tracks[16][0].notes[0].pitch=50;ui.generateBassHarmony();assert.match(ui.bassStatus.text,/重新分析/);assert.equal(ui.busy,false);assert.equal(ui.curScore.commands.length,0);
assert(qml.includes("bassRows.setProperty(bassRow.rowNumber,'choiceIndex',currentIndex)"));
console.log('PASS actual QML analyze/write handlers, candidate row indexing and stale-preview protection.');

assert.equal(harmony.analyze(data([bass(0,1920,43,4)]),true,480)[0].choices[0].label,'G');
score=new Fixture();const beforeSymbolFailure=score.serialize(),fresh=native.read(score,E,-1,-2,480,fraction),symbolRows=harmony.analyze(fresh,false,480);
assert.throws(()=>native.generate(score,fresh,symbolRows,symbolRows.map(()=>0),E,480,fraction,()=>({set text(value){throw Error('symbol failure')}})),/symbol failure/);
assert.equal(score.serialize(),beforeSymbolFailure);assert.equal(score.events.length,0);
console.log('PASS minor subtonic root suggestion and symbol-write rollback.');
