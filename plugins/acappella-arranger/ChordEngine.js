.pragma library

// Pure musical planning; no score mutations or MuseScore objects.
var letters = ['C','D','E','F','G','A','B'];
var naturals = [0,2,4,5,7,9,11];
var naturalTpc = [14,16,18,13,15,17,19];
var ranges = {
    soprano:{low:55,high:76,center:67,rank:0},
    alto:{low:50,high:71,center:60,rank:1},
    tenor:{low:48,high:67,center:55,rank:2},
    baritone:{low:41,high:64,center:49,rank:3},
    bass:{low:38,high:null,center:43,rank:4}
};
function mod(n) { return (n%12+12)%12; }
function plain(text) {
    return String(text || '').replace(/<sym>accidentalFlat<\/sym>/g,'b')
        .replace(/<sym>accidentalSharp<\/sym>/g,'#')
        .replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ')
        .replace(/&amp;/g,'&').replace(/♭/g,'b').replace(/♯/g,'#').trim();
}
function profile(name) {
    var value=plain(name).toLowerCase().replace(/[.\s_\-\d]/g,'');
    var aliases={s:'soprano',sop:'soprano',soprano:'soprano',a:'alto',alto:'alto',
        t:'tenor',tenor:'tenor',bar:'baritone',bari:'baritone',baritone:'baritone',b:'bass',bass:'bass'};
    return aliases[value] || null;
}
function spelled(letter,alter) {
    var index=letters.indexOf(letter);
    return {pc:mod(naturals[index]+alter),tpc:naturalTpc[index]+7*alter};
}
function parse(text) {
    var value=plain(text).replace(/\s+/g,'').replace(/[()]/g,'');
    if (/^(N\.?C\.?|noChord)$/i.test(value))return {label:text,silent:true};
    var match=/^([A-Ga-g])([#b]{0,2})([^/]*)(?:\/([A-Ga-g])([#b]{0,2}))?$/.exec(value);
    if(!match)throw new Error('不支持的和弦：'+plain(text));
    match[1]=match[1].toUpperCase();
    if(match[4])match[4]=match[4].toUpperCase();
    function alter(acc) { return acc.split('').reduce(function(n,c){return n+(c==='#'?1:-1);},0); }
    var root=spelled(match[1],alter(match[2])),quality=match[3];
    quality=quality.replace(/^(△|Δ)$/,'maj7').replace(/△|Δ/g,'maj').replace(/−/g,'-');
    var definitions={
        '':[[0,4,7],[0,2,4]],maj:[[0,4,7],[0,2,4]],M:[[0,4,7],[0,2,4]],
        m:[[0,3,7],[0,2,4]],min:[[0,3,7],[0,2,4]],'-':[[0,3,7],[0,2,4]],
        '7':[[0,4,7,10],[0,2,4,6]],maj7:[[0,4,7,11],[0,2,4,6]],M7:[[0,4,7,11],[0,2,4,6]],
        m7:[[0,3,7,10],[0,2,4,6]],min7:[[0,3,7,10],[0,2,4,6]],'-7':[[0,3,7,10],[0,2,4,6]],
        dim:[[0,3,6],[0,2,4]],o:[[0,3,6],[0,2,4]],'°':[[0,3,6],[0,2,4]],
        dim7:[[0,3,6,9],[0,2,4,6]],o7:[[0,3,6,9],[0,2,4,6]],'°7':[[0,3,6,9],[0,2,4,6]],
        m7b5:[[0,3,6,10],[0,2,4,6]],'ø7':[[0,3,6,10],[0,2,4,6]],'ø':[[0,3,6,10],[0,2,4,6]],
        aug:[[0,4,8],[0,2,4]],'+':[[0,4,8],[0,2,4]],
        sus:[[0,5,7],[0,3,4]],sus4:[[0,5,7],[0,3,4]],sus2:[[0,2,7],[0,1,4]],
        '7sus4':[[0,5,7,10],[0,3,4,6]],
        '6':[[0,4,7,9],[0,2,4,5]],m6:[[0,3,7,9],[0,2,4,5]]
    };
    var def=Object.prototype.hasOwnProperty.call(definitions,quality)?definitions[quality]:null;
    if(!def)throw new Error('暂不支持这个和弦类型：'+plain(text));
    var tones=[],rootLetter=letters.indexOf(match[1]);
    for(var i=0;i<def[0].length;i++) {
        var letter=(rootLetter+def[1][i])%7,pc=mod(root.pc+def[0][i]);
        var accidental=mod(pc-naturals[letter]);if(accidental>6)accidental-=12;
        if(Math.abs(accidental)>2)throw new Error('和弦拼写超出本版支持范围：'+plain(text));
        tones.push({pc:pc,tpc:naturalTpc[letter]+7*accidental});
    }
    var bass=match[4] ? spelled(match[4],alter(match[5] || '')) : root;
    return {label:plain(text),root:root,bass:bass,tones:tones,silent:false};
}
function candidates(target,chord,previous) {
    var rule=ranges[target.profile],tones=target.profile==='bass'?[chord.bass]:chord.tones;
    var high=rule.high===null ? Math.min(127,rule.low+36) : rule.high,result=[];
    for(var pitch=rule.low;pitch<=high;pitch++)for(var t=0;t<tones.length;t++) {
        if(mod(pitch)!==tones[t].pc)continue;
        var motion=previous===undefined?0:Math.abs(pitch-previous);
        result.push({pitch:pitch,tpc:tones[t].tpc,pc:tones[t].pc,
            cost:motion*2+Math.abs(pitch-rule.center)*0.25+(motion>7?(motion-7)*2:0)});
    }
    result.sort(function(a,b){return a.cost-b.cost;});
    return result.slice(0,10);
}
function voice(chord,targets,previous) {
    var ordered=targets.slice().sort(function(a,b){return ranges[a.profile].rank-ranges[b.profile].rank || a.staff-b.staff;});
    var states=[{cost:0,pitches:{},tpcs:{},pcs:{},last:128}];
    for(var i=0;i<ordered.length;i++) {
        var target=ordered[i],choices=candidates(target,chord,previous[target.staff]),next=[];
        for(var s=0;s<states.length;s++)for(var c=0;c<choices.length;c++) {
            var choice=choices[c],state=states[s];
            if(choice.pitch>state.last)continue; // no crossing of generated voices
            var pitches={},tpcs={},pcs={};
            for(var key in state.pitches){pitches[key]=state.pitches[key];tpcs[key]=state.tpcs[key];}
            for(var pc in state.pcs)pcs[pc]=state.pcs[pc];
            pitches[target.staff]=choice.pitch;tpcs[target.staff]=choice.tpc;
            var duplicate=pcs[choice.pc] || 0;pcs[choice.pc]=duplicate+1;
            next.push({cost:state.cost+choice.cost+duplicate*2,pitches:pitches,tpcs:tpcs,pcs:pcs,last:choice.pitch});
        }
        next.sort(function(a,b){return a.cost-b.cost;});states=next.slice(0,160);
        if(!states.length)throw new Error('无法在所选声部音域内分配 '+chord.label+'；请减少声部或调整选择。');
    }
    var essential=[chord.tones[1].pc];
    if(chord.tones.length===4)essential.push(chord.tones[3].pc);
    for(var n=0;n<states.length;n++) {
        for(var e=0;e<essential.length;e++)if(!states[n].pcs[essential[e]])states[n].cost+=targets.length>1?100:8;
        for(var t=0;t<chord.tones.length;t++)if(!states[n].pcs[chord.tones[t].pc])states[n].cost+=8;
    }
    states.sort(function(a,b){return a.cost-b.cost;});return states[0];
}
function durations(ticks,division) {
    var values=[];
    for(var denominator=1;denominator<=128;denominator*=2) {
        values.push({ticks:division*4/denominator,n:1,d:denominator});
        if(denominator>=2)values.push({ticks:division*6/denominator,n:3,d:denominator*2});
    }
    values.push({ticks:division*8,n:2,d:1},{ticks:division*16,n:4,d:1},
        {ticks:division*12,n:3,d:1});
    values.sort(function(a,b){return b.ticks-a.ticks;});
    var result=[],remaining=ticks;
    for(var i=0;i<values.length;i++)while(remaining>=values[i].ticks-0.00001) {
        result.push(values[i]);remaining-=values[i].ticks;
    }
    if(Math.abs(remaining)>0.00001)throw new Error('选区含本版不支持的连音或时值；请先选择普通小节。');
    return result;
}
function plan(data,targets,division) {
    if(!targets.length)throw new Error('请至少勾选一个目标声部。');
    if(targets.length>12)throw new Error('本版一次最多生成 12 个声部。');
    var events=data.events.slice().sort(function(a,b){return a.tick-b.tick;}),intervals=[];
    for(var i=0;i<events.length;i++) {
        var end=i+1<events.length?events[i+1].tick:data.end;
        var start=Math.max(data.start,events[i].tick);end=Math.min(end,data.end);
        if(end<=start)continue;
        var chord=resolve(events[i].text,data.mode || 'absolute',data.key);
        intervals.push({start:start,end:end,chord:chord});
    }
    if(!intervals.length)throw new Error('选区内没有可用的和弦符号。');
    var notes=[],previous=data.initialPitches || {},skipped=data.skipped || 0,restCount=0;
    for(var j=0;j<intervals.length;j++) {
        var interval=intervals[j];
        if(interval.chord.silent) { previous={};continue; }
        var active=[],windows={};
        for(var t=0;t<targets.length;t++) {
            var target=targets[t],eligible=data.rests[target.staff] || [],pieces=[];
            for(var r=0;r<eligible.length;r++) {
                var begin=Math.max(interval.start,eligible[r].start),end=Math.min(interval.end,eligible[r].end);
                if(end>begin)pieces.push({start:begin,end:end});
            }
            if(pieces.length){active.push(target);windows[target.staff]=pieces;}
        }
        if(!active.length)continue;
        var voicing=voice(interval.chord,active,previous);
        for(var v=0;v<active.length;v++) {
            var staff=active[v].staff,pieces=windows[staff];previous[staff]=voicing.pitches[staff];
            for(var p=0;p<pieces.length;p++) {
                var at=pieces[p].start,chunks=durations(pieces[p].end-at,division);restCount++;
                for(var k=0;k<chunks.length;k++) {
                    notes.push({staff:staff,tick:at,end:at+chunks[k].ticks,
                        pitch:voicing.pitches[staff],tpc:voicing.tpcs[staff],n:chunks[k].n,d:chunks[k].d});
                    at+=chunks[k].ticks;
                }
            }
        }
    }
    notes.sort(function(a,b){return a.staff-b.staff || a.tick-b.tick;});
    return {notes:notes,skipped:skipped,chords:intervals.length,restCount:restCount,
        labels:intervals.map(function(x){return x.chord.label;})};
}

function keyInfo(fifths,minor) {
    var tpc=14+Number(fifths)+(minor?3:0);
    for(var letter=0;letter<7;letter++)for(var alter=-2;alter<=2;alter++)
        if(naturalTpc[letter]+7*alter===tpc)return {letter:letter,pc:mod(naturals[letter]+alter),tpc:tpc,minor:!!minor};
    throw new Error('无法识别当前调号。');
}
function noteName(letter,pc) {
    var alter=mod(pc-naturals[letter]);if(alter>6)alter-=12;
    if(Math.abs(alter)>2)throw new Error('移调后的拼写超出支持范围。');
    return letters[letter]+(alter<0?'bb'.slice(0,-alter):'##'.slice(0,alter));
}
function degreeChord(text,key) {
    var value=plain(text).replace(/\s+/g,'').replace(/⁷/g,'7');
    if(/^(N\.?C\.?|noChord)$/i.test(value))return parse(value);
    var match=/^([#b]?)([1-7]|[ivIV]+)([^/]*)(?:\/([#b]?)([1-7]|[ivIV]+))?$/.exec(value);
    if(!match)throw new Error('级数写法无法识别：'+value+'；例如 1、6、5⁷ 或 I、vi、V7。');
    function index(value) {var roman={i:0,ii:1,iii:2,iv:3,v:4,vi:5,vii:6};return /^[1-7]$/.test(value)?Number(value)-1:roman[value.toLowerCase()];}
    function root(acc,degree) {
        var scales=key.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
        return noteName((key.letter+degree)%7,mod(key.pc+scales[degree]+(acc==='#'?1:acc==='b'?-1:0)));
    }
    var degree=index(match[2]);if(degree===undefined)throw new Error('无效级数：'+value);
    var quality=match[3];
    if(!quality)quality=(key.minor?['m','dim','','m','','','']:['','m','m','','','m','dim'])[degree];
    else if(quality==='7')quality=(key.minor?['m7','m7b5','maj7','m7','7','maj7','7']:['maj7','m7','m7','maj7','7','m7','m7b5'])[degree];
    var symbol=root(match[1],degree)+quality;
    if(match[5]){var bass=index(match[5]);if(bass===undefined)throw new Error('无效低音级数');symbol+='/'+root(match[4],bass);}
    var chord=parse(symbol);chord.label=plain(text)+' → '+symbol;return chord;
}
function resolve(text,mode,key) {
    if(!mode || mode==='absolute')return parse(text);
    if(mode==='degree')return degreeChord(text,key);
    var chord=parse(text);if(chord.silent)return chord;
    function transpose(tone) {
        var originalLetter=-1;
        for(var i=0;i<7;i++)if((tone.tpc-naturalTpc[i])%7===0){originalLetter=i;break;}
        var name=noteName((originalLetter+key.letter)%7,mod(tone.pc+key.pc));
        return parse(name).root;
    }
    var original=chord.label;
    chord.root=transpose(chord.root);chord.bass=transpose(chord.bass);
    chord.tones=chord.tones.map(transpose);
    function spelling(tone) {
        for(var i=0;i<7;i++)if((tone.tpc-naturalTpc[i])%7===0)return noteName(i,tone.pc);
    }
    var quality=original.replace(/^[A-Ga-g][#b]{0,2}/,'').split('/')[0];
    var symbol=spelling(chord.root)+quality;
    if(original.indexOf('/')>=0)symbol+='/'+spelling(chord.bass);
    chord.label=original+' → '+symbol;return chord;
}

