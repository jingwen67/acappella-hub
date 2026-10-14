.pragma library
.import "ChordEngine.js" as Engine

// Symbolic melody analysis. Suggestions are musical drafts, not unique answers.
function label(chord) { return chord.label.split(' → ').pop(); }
function localScore(bar,chord) {
    var score=0;
    for(var n=0;n<bar.notes.length;n++) {
        var note=bar.notes[n],length=Math.min(bar.end,note.end)-Math.max(bar.start,note.start);
        if(length<=0)continue;
        var weight=length/bar.beat;
        var at=Math.max(bar.start,note.start)-bar.start;
        if(at===0)weight*=1.8;
        else if(Math.abs(at/bar.beat-Math.round(at/bar.beat))<0.001)weight*=1.3;
        if(length>=bar.beat)weight*=1.25;
        var pc=Engine.mod(note.pitch),inside=false;
        for(var t=0;t<chord.tones.length;t++)if(chord.tones[t].pc===pc)inside=true;
        score+=weight*(inside?2:-1.4);
        if(pc===chord.root.pc)score+=weight*0.2;
    }
    return score;
}
function connection(previous,next) {
    if(!previous || !next)return 0;
    if(previous.label===next.label)return 0.65;
    var common=0;
    for(var i=0;i<previous.tones.length;i++)for(var j=0;j<next.tones.length;j++)
        if(previous.tones[i].pc===next.tones[j].pc)common++;
    var movement=Engine.mod(next.root.pc-previous.root.pc);
    return common*0.35+(movement===5?1.8:movement===7?0.8:movement===2?0.5:0);
}
function candidates(bar,minor) {
    if(!bar.notes.length)return [{chord:null,label:'休止',score:0}];
    if(bar.fixed) {
        var fixed=Engine.parse(bar.fixed);
        return [{chord:fixed.silent?null:fixed,label:bar.fixed,score:fixed.silent?0:localScore(bar,fixed),fixed:true}];
    }
    var key=Engine.keyInfo(bar.fifths,minor),result=[];
    var degrees=['1','2','3','4','5','6','7','27','57','67'];
    for(var d=0;d<degrees.length;d++) {
        var chord=Engine.degreeChord(degrees[d],key);
        chord.label=label(chord);
        result.push({chord:chord,label:chord.label,degree:degrees[d],score:localScore(bar,chord)});
    }
    result.sort(function(a,b){return b.score-a.score;});return result;
}
function paths(data,minor) {
    var previous=data.before?Engine.parse(data.before):null;
    var states=[{score:0,bars:[],last:previous,minor:minor}];
    var lastActive=0;
    for(var a=0;a<data.bars.length;a++)if(data.bars[a].notes.length)lastActive=a;
    for(var i=0;i<data.bars.length;i++) {
        var bar=data.bars[i],choices=candidates(bar,minor),next=[];
        for(var s=0;s<states.length;s++)for(var c=0;c<choices.length;c++) {
            var choice=choices[c],bonus=connection(states[s].last,choice.chord);
            if(i===0 && choice.degree==='1')bonus+=1;
            if(i===lastActive && choice.degree==='1')bonus+=2;
            next.push({score:states[s].score+choice.score+bonus,
                bars:states[s].bars.concat([{start:bar.start,end:bar.end,label:choice.label,chord:choice.chord,fixed:!!choice.fixed}]),
                last:choice.chord,minor:minor});
        }
        next.sort(function(a,b){return b.score-a.score;});states=next.slice(0,64);
    }
    var lastNote=null;
    for(var b=0;b<data.bars.length;b++)for(var n=0;n<data.bars[b].notes.length;n++) {
        var note=data.bars[b].notes[n];
        if(!lastNote || note.end>lastNote.end)lastNote=note;
    }
    for(var p=0;p<states.length;p++) {
        if(data.after && states[p].last)states[p].score+=connection(states[p].last,Engine.parse(data.after));
        if(lastNote) {
            var key=Engine.keyInfo(data.bars[lastActive].fifths,minor);
            if(Engine.mod(lastNote.pitch)===key.pc)states[p].score+=3;
        }
    }
    states.sort(function(a,b){return b.score-a.score;});return states;
}
function signature(path) { return path.bars.map(function(b){return b.start+':'+b.label;}).join('|'); }
function recommend(data,tonality) {
    if(!data.bars.length)throw new Error('没有可用的小节。');
    if(!data.bars.some(function(b){return b.notes.length>0;}))throw new Error('所选旋律没有音符。');
    var modes=tonality===1?[false]:tonality===2?[true]:
        typeof data.savedMinor==='boolean'?[data.savedMinor]:[false,true];
    var all=[];
    for(var m=0;m<modes.length;m++)all=all.concat(paths(data,modes[m]));
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
