const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function source(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/^\.(pragma|import).*$/gm,'');}
const engine={};vm.createContext(engine);vm.runInContext(source('ChordEngine.js'),engine);
const bridge={Engine:engine};vm.createContext(bridge);vm.runInContext(source('ChordScore.js'),bridge);
const E={all:99,chordRest:1,harmony:3,chord:1,rest:2};
const targets=['soprano','alto','tenor','baritone','bass'].map((profile,staff)=>({staff,profile,name:profile}));
const expected={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],
    dim:[0,3,6],dim7:[0,3,6,9],m7b5:[0,3,6,10],aug:[0,4,8],sus2:[0,2,7],sus4:[0,5,7],
    '7sus4':[0,5,7,10],'6':[0,4,7,9],m6:[0,3,7,9]};
for(const [quality,tones] of Object.entries(expected))for(const key of ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B']){
    const chord=engine.parse(key+quality);
    assert.deepEqual(Array.from(chord.tones,t=>engine.mod(t.pc-chord.root.pc)),tones);
    const result=engine.voice(chord,targets,{});
    let last=128;
    for(const target of targets){const pitch=result.pitches[target.staff],range=engine.ranges[target.profile];
        assert(pitch>=range.low && (range.high===null || pitch<=range.high));assert(pitch<=last);last=pitch;
        assert(target.profile==='bass'?engine.mod(pitch)===chord.root.pc:chord.tones.some(t=>t.pc===engine.mod(pitch)));
    }
    assert(result.pcs[chord.tones[1].pc],'third/sus tone missing');
    if(chord.tones.length===4)assert(result.pcs[chord.tones[3].pc],'seventh/sixth missing');
}
for(const name of ['C','Am','Bb7','F#m7b5','Dbmaj7','C/E','CM7','Cm7']) {
    const lower=name.charAt(0).toLowerCase()+name.slice(1).replace(/\/([A-G])/g,(_,letter)=>'/'+letter.toLowerCase());
    assert.deepEqual(JSON.parse(JSON.stringify(engine.parse(lower).tones)),JSON.parse(JSON.stringify(engine.parse(name).tones)));
    assert.equal(engine.parse(lower).bass.pc,engine.parse(name).bass.pc);
}
assert.equal(engine.parse('cM7').tones[3].pc,11);
assert.equal(engine.parse('cm7').tones[3].pc,10);
assert.equal(engine.parse('C/E').bass.pc,4);assert.equal(engine.parse('D♭maj7').tones[0].tpc,9);
assert.deepEqual(Array.from(engine.parse('C△').tones,t=>t.pc),[0,4,7,11]);
assert.equal(engine.parse('Cdim7').tones[3].tpc,5); // B double flat, not A
assert(engine.parse('N.C.').silent);assert.throws(()=>engine.parse('C13'),/不支持/);
assert.throws(()=>engine.parse('Cconstructor'),/不支持/);
for(const ticks of [15,45,480,720,1440,1920,2400,5760,9600]){
    const chunks=engine.durations(ticks,480);assert.equal(chunks.reduce((n,c)=>n+c.ticks,0),ticks);
    for(const c of chunks)assert.equal(c.ticks,1920*c.n/c.d);
}
assert.throws(()=>engine.durations(17,480),/时值/);

class Score {
    constructor(events,total=7680){
        this.events=events;this.total=total;this.nstaves=5;this.writes=0;this.commands=[];this.failAt=Infinity;
        this.staves=targets.map(t=>({part:{longName:t.name,partName:t.name,hasDrumStaff:false}}));
        this.tracks={};for(let staff=0;staff<5;staff++)this.tracks[staff*4]=Array.from({length:total/1920},(_,i)=>this.rest(i*1920,(i+1)*1920));
        this.lastMeasure={tick:{ticks:total-1920},ticks:{ticks:1920}};
        const self=this;
        this.selection={isRange:true,startStaff:0,endStaff:1,startSegment:{tick:0},endSegment:null,
            selectRange(start,end,startStaff,endStaff){this.startSegment={tick:start};this.endSegment=end===self.total?null:{tick:end};this.startStaff=startStaff;this.endStaff=endStaff;return true;}};
    }
    rest(start,end,tuplet=false){return {start,end,type:E.rest,actualDuration:{ticks:end-start},tuplet};}
    chord(start,end,pitch){
        const c={start,end,type:E.chord,fraction:{ticks:start},actualDuration:{ticks:end-start},tuplet:false,notes:[]};
        c.notes=[{pitch,tpc:0,parent:c,tieForward:null}];return c;
    }
    positions(){return [...new Set([...Object.values(this.tracks).flatMap(x=>x.map(b=>b.start)),...this.events.map(e=>e.tick)])].sort((a,b)=>a-b);}
    segment(tick){
        const self=this;
        return {tick,get annotations(){return self.events.filter(e=>e.tick===tick).map(e=>({type:E.harmony,track:(e.staff||0)*4,text:e.text}));},
            elementAt(track){return (self.tracks[track]||[]).find(b=>b.start===tick)||null;},
            get next(){const tick2=self.positions().find(p=>p>tick);return tick2===undefined?null:self.segment(tick2);}};
    }
    firstSegment(){return this.segment(this.positions()[0]);}
    findSegmentAtTick(type,tick){return this.positions().includes(tick.ticks)?this.segment(tick.ticks):null;}
    newCursor(){
        const self=this;
        return {staffIdx:0,voice:0,tick:0,segment:null,n:1,d:4,
            get element(){return this.segment?this.segment.elementAt(this.staffIdx*4+this.voice):null;},
            rewind(){const first=(self.tracks[this.staffIdx*4+this.voice]||[])[0];this.tick=first?first.start:0;this.segment=first?self.segment(this.tick):null;},
            rewindToFraction(f){this.tick=f.ticks;this.segment=self.findSegmentAtTick(1,f);},
            next(){const b=(self.tracks[this.staffIdx*4+this.voice]||[]).find(b=>b.start>this.tick);this.tick=b?b.start:0;this.segment=b?self.segment(this.tick):null;return !!b;},
            setDuration(n,d){this.n=n;this.d=d;},
            addNote(pitch){self.replace(this.staffIdx*4,this.tick,this.tick+1920*this.n/this.d,pitch);},
            addRest(){self.replace(this.staffIdx*4,this.tick,this.tick+1920*this.n/this.d,null);}
        };
    }
    replace(track,start,end,pitch){
        this.writes++;if(this.writes===this.failAt)throw Error('simulated native write failure');
        const old=this.tracks[track]||[],overlap=old.filter(b=>b.start<end&&b.end>start);
        assert(overlap.length && overlap.every(b=>b.type===E.rest&&!b.tuplet),'attempted overwrite!');
        assert.equal(overlap.reduce((n,b)=>n+Math.min(end,b.end)-Math.max(start,b.start),0),end-start);
        const result=old.filter(b=>b.end<=start||b.start>=end);
        for(const b of overlap){if(b.start<start)result.push(this.rest(b.start,start));if(b.end>end)result.push(this.rest(end,b.end));}
        let at=start,previous=null;
        while(at<end){const finish=Math.min(end,(Math.floor(at/1920)+1)*1920);
            const b=pitch===null?this.rest(at,finish):this.chord(at,finish,pitch);
            if(previous)previous.tieForward={endNote:b.notes[0]};
            if(pitch!==null)previous=b.notes[0];result.push(b);at=finish;
        }
        this.tracks[track]=result.sort((a,b)=>a.start-b.start);
    }
    serialize(){return JSON.stringify(Object.fromEntries(Object.entries(this.tracks).map(([k,v])=>[k,v.map(b=>({start:b.start,end:b.end,type:b.type,tuplet:b.tuplet,pitch:b.notes?.[0].pitch,tpc:b.notes?.[0].tpc}))])));}
    startCmd(){this.commands.push('start');this.snapshot=this.serialize();}
    endCmd(rollback){
        this.commands.push(rollback?'rollback':'commit');
        if(rollback)this.tracks=Object.fromEntries(Object.entries(JSON.parse(this.snapshot)).map(([k,v])=>[k,v.map(b=>{
            const out=b.type===E.rest?this.rest(b.start,b.end,b.tuplet):this.chord(b.start,b.end,b.pitch);
            if(out.notes)out.notes[0].tpc=b.tpc;return out;
        })]));
    }
}
const progression=['C','Am','F','G7'].map((text,i)=>({tick:i*1920,text}));
let score=new Score(progression),data=bridge.read(score,E,-1,targets),plan=engine.plan(data,targets,480);
assert.equal(plan.notes.length,20);score.startCmd();bridge.write(score,plan,E,t=>({ticks:t}),480);score.endCmd();
for(const blocks of Object.values(score.tracks))assert(blocks.every(b=>b.type===E.chord));
assert.equal(engine.plan(bridge.read(score,E,-1,targets),targets,480).notes.length,0,'repeat generation overwrote notes');
score=new Score([{tick:0,text:'C/E'}]);data=bridge.read(score,E,-1,targets);plan=engine.plan(data,targets,480);
bridge.write(score,plan,E,t=>({ticks:t}),480);assert(Object.values(score.tracks).every(v=>v[0].notes[0].tieForward));
assert(score.tracks[16].every(b=>b.notes[0].pitch%12===4),'slash bass wrong');
score=new Score([{tick:480,text:'C'},{tick:1920,text:'N.C.'},{tick:3840,text:'F'}]);
plan=engine.plan(bridge.read(score,E,-1,targets),targets,480);bridge.write(score,plan,E,t=>({ticks:t}),480);
assert.equal(score.tracks[0][0].type,E.rest);assert.equal(score.tracks[0][0].end,480);
assert(score.tracks[0].filter(b=>b.start>=1920&&b.start<3840).every(b=>b.type===E.rest));
score=new Score(progression);score.selection.selectRange(1920,5760,0,1);data=bridge.read(score,E,-1,targets);
plan=engine.plan(data,targets,480);bridge.write(score,plan,E,t=>({ticks:t}),480);
assert(Object.values(score.tracks).every(v=>v[0].type===E.rest&&v[v.length-1].type===E.rest));
score=new Score(progression);score.tracks[0][0]=score.chord(0,1920,72);
score.tracks[5]=[score.chord(480,960,60)];score.tracks[8][1].tuplet=true;
data=bridge.read(score,E,-1,targets);assert(data.rests[0].every(b=>b.start>=1920));
assert(data.rests[1].every(b=>b.start>=1920));assert(!data.rests[2].some(b=>b.start<3840&&b.end>1920));
plan=engine.plan(data,targets,480);bridge.write(score,plan,E,t=>({ticks:t}),480);
assert.equal(score.tracks[0][0].notes[0].pitch,72);assert.equal(score.tracks[5][0].notes[0].pitch,60);
score=new Score([{tick:0,text:'C'},{tick:0,text:'Am'}]);assert.throws(()=>bridge.read(score,E,-1,targets),/重复/);
score=new Score(progression);score.selection.isRange=false;assert.throws(()=>bridge.read(score,E,-1,targets),/选框/);
// Exercise the actual QML transaction body, including rollback and busy guards.
const qml=fs.readFileSync(path.join(root,'AcappellaTemplate.qml'),'utf8');
const start=qml.indexOf('    function generateChords()'),brace=qml.indexOf('{',start);let depth=1,end=brace+1;
for(;depth;end++){if(qml[end]==='{')depth++;if(qml[end]==='}')depth--;}
function generate(score,busy=false){
    const ctx={busy,rangeBusy:false,curScore:score,syncChordTargets(){},ChordScore:bridge,ChordEngine:engine,
        sourceStaff:{currentIndex:0},division:480,chordStatus:{text:''},console:{log(){},error(){}},Segment:{All:99,ChordRest:1},
        Element:{HARMONY:3,CHORD:1,REST:2},chordTargets:{count:targets.length,get:i=>({...targets[i],selected:true})}};
    ctx.root={fractionFromTicks:t=>({ticks:t})};vm.createContext(ctx);vm.runInContext(qml.slice(start,end).trim(),ctx);ctx.generateChords();return ctx;
}
score=new Score(progression);generate(score);assert.deepEqual(score.commands,['start','commit']);
score=new Score(progression);const before=score.serialize();score.failAt=3;
const failed=generate(score);assert.deepEqual(score.commands,['start','rollback']);assert.equal(score.serialize(),before);assert.equal(failed.busy,false);assert.match(failed.chordStatus.text,/失败/);
score=new Score([{tick:0,text:'C13'}]);generate(score);assert.equal(score.writes,0);assert.equal(score.commands.length,0);
score=new Score(progression);generate(score,true);assert.equal(score.writes,0);
console.log('PASS: 196 chord spellings/voicings, durations, slash bass, cross-bar ties, silent gaps, selection limits, existing notes/all voices/tuplets, repeat generation, unsupported symbols, one undo command and failure rollback. Real MuseScore UI not tested.');
