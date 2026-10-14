.pragma library
.import "ChordEngine.js" as Engine

// Beginner pop accompaniment: compare coherent schemas and a functional fallback.
// Numerical comparison implements these musical choices; weights are not trained.
function label(chord) { return chord.label.split(' → ').pop(); }
function contains(chord,pitch) {
    return chord.tones.some(function(t){return t.pc===Engine.mod(pitch);});
}
function embellishment(notes,index,chord,bar) {
    var n=notes[index],a=notes[index-1],b=notes[index+1];
    if(!a || !b || a.end!==n.start || n.end!==b.start || n.end-n.start>=bar.beat)return false;
    // Weak, brief stepwise passing/neighbor tone between this chord's tones.
    var offset=n.start-bar.start;
    if(offset<0 || Math.abs(offset/bar.beat-Math.round(offset/bar.beat))<0.001)return false;
    var x=n.pitch-a.pitch,y=b.pitch-n.pitch;
    return contains(chord,a.pitch) && contains(chord,b.pitch) &&
        Math.abs(x)>0 && Math.abs(x)<=2 && Math.abs(y)>0 && Math.abs(y)<=2 &&
        (x*y>0 || a.pitch===b.pitch);
}
function localScore(bar,chord) {
    var sum=0,total=0,notes=bar.notes.slice().sort(function(a,b){return a.start-b.start;});
    for(var i=0;i<notes.length;i++) {
        var n=notes[i],duration=Math.min(bar.end,n.end)-Math.max(bar.start,n.start);
        if(duration<=0)continue;
        var at=Math.max(bar.start,n.start)-bar.start,weight=duration/bar.beat;
        if(at===0)weight*=1.5;
        else if(Math.abs(at/bar.beat-Math.round(at/bar.beat))<0.001)weight*=1.2;
        if(embellishment(notes,i,chord,bar))continue;
        total+=weight;
        sum+=weight*(contains(chord,n.pitch)?2:-3);
    }
    // Normalize so meter and note count do not overwhelm phrase organization.
    return total?sum/total:0;
}
function candidates(bar,minor) {
    if(!bar.notes.length)return [{chord:null,label:'休止',score:0}];
    if(bar.fixed) {
        var f=Engine.parse(bar.fixed);
        return [{chord:f.silent?null:f,label:bar.fixed,score:f.silent?0:localScore(bar,f),fixed:true}];
    }
    var key=Engine.keyInfo(bar.fifths,minor),degrees=minor?['1','3','4','5','5m','6','7']:['1','2','3','4','5','6'];
    return degrees.map(function(degree){
        var chord=Engine.degreeChord(degree,key);chord.label=label(chord);
        return {chord:chord,label:chord.label,degree:degree,score:localScore(bar,chord)};
    });
}
var degreeCache={};
function degreeOf(chord,bar,minor) {
    if(!chord)return '';
    var id=String(bar.fifths)+':'+minor;
    if(!degreeCache[id]) {
        var map={},key=Engine.keyInfo(bar.fifths,minor),degrees=minor?['1','3','4','5','5m','6','7']:['1','2','3','4','5','6'];
        for(var i=0;i<degrees.length;i++)map[label(Engine.degreeChord(degrees[i],key))]=degrees[i];
        degreeCache[id]=map;
    }
    return degreeCache[id][chord.label] || '';
}
function connection(previous,next,bar,minor) {
    if(!previous || !next)return 0;
    var a=degreeOf(previous,bar,minor),b=degreeOf(next,bar,minor);
    if(a===b && a)return 0.2;
    // Functional options plus common pop moves, including V-IV and V-vi.
    var moves=minor?{'1':['3','4','5','5m','6','7'],'3':['4','6','7'],'4':['1','5','5m','7'],
        '5':['1','6'],'5m':['1','6'],'6':['3','4','5','7'],'7':['1','3','6']}:
        {'1':['2','3','4','5','6'],'2':['4','5'],'3':['4','6'],'4':['1','2','5'],
         '5':['1','4','6'],'6':['2','3','4','5']};
    return moves[a] && moves[a].indexOf(b)>=0?0.3:-0.6;
}
function event(bar,choice) {
    return {start:bar.start,end:bar.end,label:choice.label,chord:choice.chord,fixed:!!choice.fixed};
}
function paths(data,minor) {
    var families=minor?[
        {name:'小调流行循环',degrees:['1','6','3','7']},
        {name:'小调下行循环',degrees:['1','7','6','5']},
        {name:'小调基本伴奏',degrees:['1','4','5','1']},
        {name:'小调主和弦延续',degrees:['1']}
    ]:[
        {name:'流行四和弦',degrees:['1','5','6','4']},
        {name:'抒情四和弦',degrees:['1','6','4','5']},
        {name:'基础主下属属',degrees:['1','4','5','1']},
        {name:'二五一连接',degrees:['1','6','2','5']},
        {name:'主和弦延续',degrees:['1']}
    ];
    var result=[],lists=data.bars.map(function(bar){return candidates(bar,minor);});
    // Compare whole loops, their rotations, and one/two-bar harmonic rhythms.
    // This is a set of accompaniment options, not automatic phrase detection.
    for(var f=0;f<families.length;f++)for(var span=1;span<=2;span++)for(var rotation=0;rotation<families[f].degrees.length;rotation++) {
        var state={score:0,bars:[],last:data.before?Engine.parse(data.before):null,minor:minor,name:families[f].name};
        for(var i=0;i<data.bars.length;i++) {
            var bar=data.bars[i],position=bar.number?bar.number-1:i;
            var degree=families[f].degrees[(Math.floor(position/span)+rotation)%families[f].degrees.length];
            var choice=lists[i].filter(function(c){return c.fixed || !c.chord || c.degree===degree;})[0];
            if(!choice){state=null;break;}
            state.score+=choice.score+connection(state.last,choice.chord,bar,minor);
            state.bars.push(event(bar,choice));state.last=choice.chord;
        }
        if(state){state.score+=0.25*data.bars.length;result.push(state);}
    }
    // A free basic progression remains available if every stock loop clashes.
    var states=[{score:0,bars:[],last:data.before?Engine.parse(data.before):null,minor:minor,name:'基础自由进行'}];
    for(var i=0;i<data.bars.length;i++) {
        var next=[],bar=data.bars[i];
        for(var a=0;a<states.length;a++)for(var c=0;c<lists[i].length;c++) {
            var choice=lists[i][c];
            next.push({score:states[a].score+choice.score+connection(states[a].last,choice.chord,bar,minor),
                bars:states[a].bars.concat([event(bar,choice)]),last:choice.chord,minor:minor,name:'基础自由进行'});
        }
        next.sort(function(a,b){return b.score-a.score;});states=next.slice(0,64);
    }
    result=result.concat(states);
    for(var p=0;p<result.length;p++)if(data.after)
        result[p].score+=connection(result[p].last,Engine.parse(data.after),data.bars[data.bars.length-1],minor);
    result.sort(function(a,b){return b.score-a.score;});return result;
}
function signature(path) { return path.bars.map(function(b){return b.start+':'+b.label;}).join('|'); }
function recommend(data,tonality) {
    if(!data.bars.length)throw new Error('没有可用的小节。');
    if(!data.bars.some(function(b){return b.notes.length>0;}))throw new Error('所选旋律没有音符。');
    var modes=tonality===1?[false]:tonality===2?[true]:
        typeof data.savedMinor==='boolean'?[data.savedMinor]:[false,true];
    var all=[];
    for(var m=0;m<modes.length;m++) {
        var options=paths(data,modes[m]),tonic=Engine.keyInfo(data.bars[0].fifths,modes[m]).pc;
        // Small tie-break from melodic tonic emphasis across the whole excerpt,
        // never a demand for the final chord to be tonic.
        var emphasis=0,total=0;
        for(var b=0;b<data.bars.length;b++)for(var n=0;n<data.bars[b].notes.length;n++) {
            var note=data.bars[b].notes[n],length=Math.min(note.end,data.bars[b].end)-Math.max(note.start,data.bars[b].start);
            total+=length;if(Engine.mod(note.pitch)===tonic)emphasis+=length;
        }
        for(var p=0;p<options.length;p++)options[p].score+=total?0.5*emphasis/total:0;
        all=all.concat(options);
    }
    all.sort(function(a,b){return b.score-a.score;});
    var unique=[],seen={};
    for(var i=0;i<all.length && unique.length<3;i++) {
        var key=signature(all[i]);if(seen[key])continue;seen[key]=true;unique.push(all[i]);
    }
    return unique;
}
function current(data,fallback) {
    var result={bars:[],minor:typeof data.savedMinor==='boolean'?data.savedMinor:fallback.minor};
    for(var i=0;i<data.bars.length;i++) {
        var bar=data.bars[i],value=bar.current || fallback.bars[i].label;
        var chord=value==='休止'?null:Engine.parse(value);
        if(chord && chord.silent)chord=null;
        result.bars.push({start:bar.start,end:bar.end,label:value,chord:chord,fixed:!!bar.fixed});
    }
    return result;
}
