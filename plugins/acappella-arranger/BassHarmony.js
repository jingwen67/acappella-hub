.pragma library
.import "BassVoicing.js" as Music

function inside(chord,pitch) {
    return chord.tones.some(function(t){return t.pc===Music.mod(pitch);});
}
function strong(measure,tick) {
    var unit=measure.unit,position=(tick-measure.start)/unit;
    if(Math.abs(position-Math.round(position))>0.001)return false;
    if(position===0)return true;
    if(measure.denominator===8 && measure.numerator>3 && measure.numerator%3===0)return position%3===0;
    return measure.numerator===4 && position===2;
}
function chordChoices(slot,key) {
    var degrees=key.minor?['1','2','3','4','5','5m','6','7','57']:['1','2','3','4','5','6','7','57'];
    var result=[];
    for(var d=0;d<degrees.length;d++) {
        var chord=Music.degreeChord(degrees[d],key);
        if(!inside(chord,slot.bass.pitch))continue;
        var name=chord.label.split(' → ').pop(),root=chord.root.pc===Music.mod(slot.bass.pitch);
        if(!root)name+='/'+Music.noteName(slot.bass.letter,Music.mod(slot.bass.pitch));
        // Bass establishes the harmonic foundation; root position is the default,
        // but melody compatibility may favor a first/second inversion.
        var conflict=0,covered=0,total=0;
        for(var i=0;i<slot.solo.length;i++) {
            var n=slot.solo[i],length=Math.min(n.end,slot.end)-Math.max(n.start,slot.start);
            if(length<=0)continue;
            var important=length>=slot.beat || n.start===slot.start;
            if(!important)continue;
            total+=length;if(inside(chord,n.pitch))covered+=length;else conflict+=length;
        }
        var inversion=0;for(var t=0;t<chord.tones.length;t++)if(chord.tones[t].pc===Music.mod(slot.bass.pitch))inversion=t;
        // Avoid making root-position diminished or second-inversion chords the
        // first suggestion in a beginner accompaniment without contextual need.
        var cost=(root?0:inversion===1?0.8:1.4)+((!key.minor && degrees[d]==='7') || (key.minor && degrees[d]==='2')?1.5:0);
        if(chord.tones.length===4)cost+=0.6;
        if(total)cost+=4*conflict/total;
        result.push({label:name,cost:cost,root:root,melodyConflict:conflict>0});
    }
    result.sort(function(a,b){return a.cost-b.cost;});return result;
}
function analyze(data,minor,division) {
    var slots=[];
    for(var m=0;m<data.measures.length;m++) {
        var measure=data.measures[m],bass=data.bass.filter(function(n){return n.start<measure.end && n.end>measure.start;});
        if(!bass.length)continue;
        var compound=measure.denominator===8 && measure.numerator>3 && measure.numerator%3===0;
        var beat=measure.unit*(compound?3:1);
        var anchors=[];
        for(var i=0;i<bass.length;i++) {
            var n=bass[i],at=Math.max(n.start,measure.start,data.start);
            if(at<data.start || at>=data.end)continue;
            var previous=bass[i-1],next=bass[i+1],short=n.end-n.start<beat;
            var passing=previous && next && previous.end===n.start && n.end===next.start && short &&
                !strong(measure,n.start) && Math.abs(n.pitch-previous.pitch)<=2 && Math.abs(next.pitch-n.pitch)<=2 &&
                (previous.pitch===next.pitch || (n.pitch-previous.pitch)*(next.pitch-n.pitch)>0);
            if(passing)continue;
            if(!anchors.length || strong(measure,at) || !short ||
                !previous || previous.end<n.start || Music.mod(previous.pitch)!==Music.mod(n.pitch))anchors.push({start:at,bass:n});
        }
        for(var a=0;a<anchors.length;a++) {
            var start=anchors[a].start,end=Math.min(a+1<anchors.length?anchors[a+1].start:measure.end,data.end);
            // A rest breaks accompaniment; do not sustain through an absent bass.
            for(var b=0;b<bass.length;b++)if(bass[b].start>=start && bass[b].start<end &&
                (b+1===bass.length || bass[b+1].start>bass[b].end))end=Math.min(end,bass[b].end);
            if(end<=start)continue;
            var slot={start:start,end:end,bass:anchors[a].bass,beat:beat,measure:measure.number,
                position:1+(start-measure.start)/measure.unit,
                solo:data.solo.filter(function(n){return n.start<end && n.end>start;})};
            var key=Music.keyInfo(measure.fifths,minor);slot.choices=chordChoices(slot,key);
            if(!slot.choices.length)throw new Error('第 '+measure.number+' 小节的低音不属于本版支持的基础和弦；请检查调号或大小调。');
            slots.push(slot);
        }
    }
    if(!slots.length)throw new Error('选区内没有可分析的 Bass 音符。');
    if(slots.length>256)throw new Error('一次最多分析 256 个和弦位置，请缩小选区。');
    return slots;
}
