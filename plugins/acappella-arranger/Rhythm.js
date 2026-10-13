.pragma library
.import "ChordEngine.js" as Engine

function chordAt(data,tick) {
    var event=null;
    for(var i=0;i<data.events.length;i++) {
        if(data.events[i].tick>tick)break;
        event=data.events[i];
    }
    return event?Engine.resolve(event.text,data.mode || 'absolute',data.key):null;
}
function baseAt(notes,staff,tick) {
    for(var i=0;i<notes.length;i++)if(notes[i].staff===staff && notes[i].tick<=tick && notes[i].end>tick)return notes[i];
    return null;
}
function arpeggio(base,slot,targets,notes,chord,previous) {
    var target=null,lower=null,upper=null;
    var ordered=targets.slice().sort(function(a,b){return Engine.ranges[a.profile].rank-Engine.ranges[b.profile].rank || a.staff-b.staff;});
    for(var i=0;i<ordered.length;i++)if(ordered[i].staff===base.staff) {
        target=ordered[i];
        for(var h=i-1;h>=0;h--) {var above=baseAt(notes,ordered[h].staff,slot.tick);if(above){upper=above.pitch;break;}}
        for(var l=i+1;l<ordered.length;l++) {var below=baseAt(notes,ordered[l].staff,slot.tick);if(below){lower=below.pitch;break;}}
        break;
    }
    if(target.profile==='bass')return {pitch:base.pitch,tpc:base.tpc};
    var range=Engine.ranges[target.profile];
    // Disjoint registers around the original voicing preserve vertical order.
    var low=lower===null?range.low:Math.max(range.low,Math.ceil((base.pitch+lower)/2));
    var high=upper===null?range.high:Math.min(range.high,Math.floor((base.pitch+upper)/2));
    var tone=chord.tones[(slot.step+Engine.ranges[target.profile].rank)%chord.tones.length],best=null,cost=Infinity;
    for(var pitch=low;pitch<=high;pitch++)if(Engine.mod(pitch)===tone.pc) {
        var candidate=Math.abs(pitch-(previous===undefined?base.pitch:previous))+Math.abs(pitch-base.pitch)*0.25;
        if(candidate<cost){cost=candidate;best={pitch:pitch,tpc:tone.tpc};}
    }
    return best || {pitch:base.pitch,tpc:base.tpc};
}
function plan(data,targets,division,basePlan) {
    var style=data.rhythm || 'long';
    if(style==='long')return basePlan;
    if(['beat','eighth','offbeat','arpeggio','alternating','follow'].indexOf(style)<0)throw new Error('未知节奏型。');
    if(!data.measures || !data.measures.length)throw new Error('无法读取小节位置。');
    if(style==='follow' && (!data.attacks || !data.attacks.length))throw new Error('节奏来源选区没有音符；请选择有旋律的谱表。');
    var result=[],previous={};
    for(var i=0;i<basePlan.notes.length;i++) {
        var base=basePlan.notes[i],slots=[];
        if(style==='follow') {
            for(var a=0;a<data.attacks.length;a++)slots.push({tick:data.attacks[a].start,end:data.attacks[a].end,step:a});
        } else {
            var bass=false;
            for(var t=0;t<targets.length;t++)if(targets[t].staff===base.staff)bass=targets[t].profile==='bass';
            for(var m=0;m<data.measures.length;m++) {
                var measure=data.measures[m];
                if(measure.end<=base.tick || measure.start>=base.end)continue;
                var pulse=(style==='eighth' || style==='arpeggio')?division/2:measure.beat;
                for(var at=measure.start,step=0;at<measure.end;at+=pulse,step++) {
                    var begin=at,end=Math.min(at+pulse,measure.end);
                    var offset=measure.offbeat===undefined?pulse/2:measure.offbeat;
                    if(style==='offbeat' || (style==='alternating' && !bass))begin=at+offset;
                    else if(style==='alternating' && bass)end=Math.min(at+offset,measure.end);
                    if(end>begin)slots.push({tick:begin,end:end,step:step});
                }
            }
        }
        for(var s=0;s<slots.length;s++) {
            var slot=slots[s],start=Math.max(base.tick,slot.tick),end=Math.min(base.end,slot.end);
            if(end<=start)continue;
            var chord=chordAt(data,start);
            if(!chord || chord.silent)continue;
            var tone=style==='arpeggio'?arpeggio(base,{tick:start,step:slot.step},targets,basePlan.notes,chord,previous[base.staff]):{pitch:base.pitch,tpc:base.tpc};
            previous[base.staff]=tone.pitch;
            var chunks=Engine.durations(end-start,division),tick=start;
            for(var c=0;c<chunks.length;c++) {
                result.push({staff:base.staff,tick:tick,end:tick+chunks[c].ticks,pitch:tone.pitch,tpc:tone.tpc,n:chunks[c].n,d:chunks[c].d});
                tick+=chunks[c].ticks;
            }
        }
    }
    result.sort(function(a,b){return a.staff-b.staff || a.tick-b.tick;});
    if(result.length>4096)throw new Error('本次节奏音符过多，请缩短选区、分段生成。');
    return {notes:result,restCount:result.length,skipped:basePlan.skipped,chords:basePlan.chords,labels:basePlan.labels};
}
