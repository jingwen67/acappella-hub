const assert=require('node:assert/strict');
const {engine,bridge,rhythm,Score,targets,E,generate}=require('./chords.test.cjs');
const events=[{tick:0,text:'C'},{tick:1920,text:'Am'},{tick:3840,text:'F'},{tick:5760,text:'G7'}];
function planned(score,style,source=-1,chosen=targets) {
    const data=bridge.read(score,E,-1,chosen);data.rhythm=style;
    bridge.rhythmData(score,E,source,data,480);
    return {data,plan:rhythm.plan(data,chosen,480,engine.plan(data,chosen,480))};
}
for(const style of ['beat','eighth','offbeat','arpeggio','alternating']) {
    const score=new Score(events),{data,plan}=planned(score,style);
    assert(plan.notes.length>0);const before=score.serialize();
    for(const note of plan.notes) {
        const range=engine.ranges[targets[note.staff].profile];
        assert(note.tick>=data.start&&note.end<=data.end);
        assert(note.pitch>=range.low && (range.high===null || note.pitch<=range.high));
        const chord=rhythm.chordAt(data,note.tick);
        assert(targets[note.staff].profile==='bass'?engine.mod(note.pitch)===chord.bass.pc:chord.tones.some(t=>t.pc===engine.mod(note.pitch)));
        if(style==='offbeat')assert.equal(note.tick%480,240);
        if(style==='alternating')assert.equal(note.tick%480,targets[note.staff].profile==='bass'?0:240);
        if(style==='arpeggio') {
            for(const other of plan.notes)if(other.tick===note.tick && other.staff>note.staff)assert(note.pitch>=other.pitch,'arpeggio crossing');
        }
    }
    score.startCmd();bridge.write(score,plan,E,t=>({ticks:t}),480);score.endCmd();
    assert.notEqual(score.serialize(),before);
    for(const blocks of Object.values(score.tracks)){
        assert.equal(blocks[0].start,0);assert.equal(blocks[blocks.length-1].end,7680);
        for(let i=1;i<blocks.length;i++)assert.equal(blocks[i-1].end,blocks[i].start);
    }
    if(style==='offbeat')assert(Object.values(score.tracks).every(v=>v[0].type===E.rest));
}
// 6/8 uses two dotted-quarter beats, and three-quarter pickup/bar lengths.
let score=new Score([{tick:0,text:'C'}],1920);
score.total=1440;score.lastMeasure={tick:{ticks:0},ticks:{ticks:1440}};
score.firstMeasure={tick:{ticks:0},ticks:{ticks:1440},timesigNominal:{numerator:6,denominator:8},nextMeasure:null};
for(let track=0;track<20;track+=4)score.tracks[track]=[score.rest(0,1440)];
let {data,plan}=planned(score,'offbeat');assert.equal(data.measures[0].beat,720);
assert.deepEqual(Array.from(plan.notes.filter(n=>n.staff===0),n=>[n.tick,n.end]),[[480,720],[1200,1440]]);
bridge.write(score,plan,E,t=>({ticks:t}),480);
score=new Score([{tick:0,text:'C'}]);
score.selection.selectRange(1920,5760,0,1);({plan}=planned(score,'eighth'));
assert(plan.notes.every(n=>n.tick>=1920&&n.end<=5760));
// Follow source rhythm: eighth attack, silence, tied note spanning a barline.
score=new Score([{tick:0,text:'C'}]);
score.staves[0].part.longName='Solo';
score.tracks[0]=[score.chord(0,240,72),score.rest(240,480),score.chord(480,1920,74),
    score.chord(1920,2400,74),score.rest(2400,7680)];
score.tracks[0][3].notes[0].tieBack={};
({data,plan}=planned(score,'follow',-1,targets.slice(1)));
assert.deepEqual(JSON.parse(JSON.stringify(data.attacks)),[{start:0,end:240},{start:480,end:2400}]);
assert(plan.notes.every(n=>n.tick<240 || n.tick>=480 && n.end<=2400));
const sourceBefore=JSON.stringify(score.tracks[0].map(b=>({start:b.start,end:b.end,type:b.type,pitch:b.notes?.[0].pitch})));
bridge.write(score,plan,E,t=>({ticks:t}),480);
assert.equal(JSON.stringify(score.tracks[0].map(b=>({start:b.start,end:b.end,type:b.type,pitch:b.notes?.[0].pitch}))),sourceBefore);
score=new Score(events);score.tracks[0][0].tuplet=true;score.tracks[0][0].type=E.chord;score.tracks[0][0].notes=[{tieBack:null}];
assert.throws(()=>planned(score,'follow',0),/连音/);
score=new Score(events);assert.throws(()=>planned(score,'follow'),/Solo/);
assert.throws(()=>planned(score,'follow',0),/没有音符/);
// Actual QML dispatch and transaction rollback for each preset.
for(let style=1;style<=5;style++) {
    score=new Score(events);generate(score,false,0,style);
    assert.deepEqual(score.commands,['start','commit']);
    score=new Score(events);score.failAt=3;const before=score.serialize();
    const failed=generate(score,false,0,style);
    assert.deepEqual(score.commands,['start','rollback']);assert.equal(score.serialize(),before);assert.equal(failed.busy,false);
}
score=new Score(events);score.tracks[0][0]=score.chord(0,1920,72);generate(score,false,0,6,0);
assert.deepEqual(score.commands,['start','commit']);assert.equal(score.tracks[0][0].notes[0].pitch,72);
score=new Score(events);score.staves.forEach(s=>s.key=()=>2);generate(score,false,2,2);
assert.deepEqual(score.commands,['start','commit']);assert.equal(score.tracks[16][0].notes[0].pitch%12,2);
const large={start:0,end:1920*600,events:[{tick:0,text:'C'}],rests:{0:[{start:0,end:1920*600}]},rhythm:'eighth',
    measures:Array.from({length:600},(_,i)=>({start:1920*i,end:1920*(i+1),beat:480}))};
assert.throws(()=>rhythm.plan(large,[targets[0]],480,engine.plan(large,[targets[0]],480)),/过多/);
console.log('PASS: all rhythmic presets, attack/gap timing, 6/8 compound beats, voice ranges/order, source ties/rests, no melody edits, selection boundaries, transpose mode, QML dispatch and failure rollback. Desktop MuseScore remains untested.');
