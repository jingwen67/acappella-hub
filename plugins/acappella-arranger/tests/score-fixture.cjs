const assert=require('node:assert/strict');
const E={all:99,chordRest:1,harmony:3,chord:1,rest:2};
const targets=['soprano','alto','tenor','baritone','bass'].map((profile,staff)=>({staff,profile,name:profile}));
class Score {
    constructor(events,total=7680){
        this.events=events;this.total=total;this.nstaves=5;this.writes=0;this.commands=[];this.failAt=Infinity;
        this.staves=targets.map(t=>({part:{longName:t.name,partName:t.name,hasDrumStaff:false}}));
        this.tracks={};for(let staff=0;staff<5;staff++)this.tracks[staff*4]=Array.from({length:total/1920},(_,i)=>this.rest(i*1920,(i+1)*1920));
        this.lastMeasure={tick:{ticks:total-1920},ticks:{ticks:1920}};
        let next=null;
        for(let start=total-1920;start>=0;start-=1920){
            next={tick:{ticks:start},ticks:{ticks:1920},timesigNominal:{numerator:4,denominator:4},nextMeasure:next};
        }
        this.firstMeasure=next;
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
            if(previous){previous.tieForward={endNote:b.notes[0]};b.notes[0].tieBack={startNote:previous};}
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

module.exports={Score,E};
