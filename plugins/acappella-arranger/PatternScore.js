.pragma library
.import "BassVoicing.js" as Music
.import "BassWrite.js" as Writer
.import "BassScore.js" as Bass

function measures(score) {
    var rows=[],m=score.firstMeasure,number=1;
    while(m){var start=Writer.fractionTicks(m.tick),end=start+Writer.fractionTicks(m.ticks),time=m.timesigNominal;
        rows.push({start:start,end:end,number:number,numerator:Number(time.numerator),denominator:Number(time.denominator)});
        m=m.nextMeasure;number++;}
    return rows;
}
function names(score) {
    var rows=[];for(var i=0;i<score.nstaves;i++)rows.push(Music.plain(score.staves[i].part.longName || score.staves[i].part.partName));
    return JSON.stringify(rows);
}
function capture(score,enums,bassIndex,soloIndex,division,fraction,range) {
    var sources=Bass.detect(score,bassIndex,soloIndex),sel=score.selection;
    if(!range && (!sel.isRange || !sel.startSegment))throw new Error('请先用蓝色范围选框选中节奏样例小节。');
    var all=measures(score),start=range?range.start:sel.startSegment.tick,end=range?range.end:sel.endSegment?sel.endSegment.tick:all[all.length-1].end;
    var bars=all.filter(function(m){return m.start<end && m.end>start;});
    if(!bars.length || bars.length>16)throw new Error('节奏样例请选择 1–16 个连续小节。');
    start=bars[0].start;end=bars[bars.length-1].end;
    var targets=Writer.targets(score).filter(function(t){return t.staff!==sources.bass && t.staff!==sources.solo && t.profile!=='bass';});
    var patterns={},staffs=[];
    for(var t=0;t<targets.length;t++) {
        var staff=targets[t].staff,events=[],cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=0;cursor.rewind(0);
        for(var v=1;v<4;v++){var extra=score.newCursor();extra.staffIdx=staff;extra.voice=v;extra.rewind(0);
            while(extra.segment && extra.tick<end){if(extra.tick>=start && extra.element && extra.element.type===enums.chord)
                throw new Error('样例伴唱请只使用第一音轨。');if(!extra.next())break;}}
        while(cursor.segment && cursor.tick<end) {
            var element=cursor.element;
            if(element && element.type===enums.chord) {
                var finish=cursor.tick+Writer.fractionTicks(element.actualDuration);
                if(finish>start && cursor.tick<end) {
                    if(element.tuplet || element.notes.length!==1)throw new Error('样例需为第一音轨单音，暂不支持连音。');
                    if(cursor.tick<start || finish>end)throw new Error('样例音符跨出选区，请扩大样例范围。');
                    if(element.notes[0].tieBack) {
                        if(!events.length || events[events.length-1].end!==cursor.tick)throw new Error('样例从延音线中间开始，请扩大选区。');
                        events[events.length-1].end=finish;
                    } else events.push({start:cursor.tick,end:finish});
                    if(finish===end && element.notes[0].tieForward)throw new Error('样例末尾延音线跨出选区，请扩大选区。');
                }
            }
            if(!cursor.next())break;
        }
        if(events.length) {
            for(var a=0;a<events.length;a++)if(Music.durations(events[a].end-events[a].start,division).length!==1)throw new Error('样例包含暂不支持的复合延音时值，请先拆成普通起音。');
            staffs.push(targets[t]);patterns[staff]=events.map(function(e){return {offset:e.start-start,length:e.end-e.start};});
        }
    }
    if(!staffs.length)throw new Error('选区内没有 Soprano／Alto／Tenor／Baritone 的节奏样例。');
    var template={start:start,end:end,length:end-start,bars:bars,targets:staffs,patterns:patterns,
        bassStaff:sources.bass,soloStaff:sources.solo,names:names(score)};
    template.signature=JSON.stringify(template);return template;
}
function events(score,enums,staff,end) {
    var result=[],segment=score.firstSegment(enums.all);
    while(segment && segment.tick<end) {
        for(var i=0;i<segment.annotations.length;i++) {
            var a=segment.annotations[i];
            if(a.type===enums.harmony && Math.floor(a.track/4)===staff) {
                var text=Music.plain(a.text),last=result[result.length-1];
                if(last && last.tick===segment.tick && last.text!==text)throw new Error('同一位置存在不同的 Bass 和弦符号，请先整理。');
                if(!last || last.tick!==segment.tick)result.push({tick:segment.tick,text:text});
            }
        }
        segment=segment.next;
    }
    return result;
}
function targetRange(score,template) {
    var all=measures(score),sel=score.selection,start=template.end,end=all[all.length-1].end;
    if(sel.isRange && sel.startSegment) {
        var s=sel.startSegment.tick,e=sel.endSegment?sel.endSegment.tick:end;
        var selected=all.filter(function(m){return m.start<e && m.end>s;});
        // Keeping the sample selected means "fill the remaining bars".
        if(selected.length && (selected[0].start!==template.start || selected[selected.length-1].end!==template.end)) {
            start=selected[0].start;end=selected[selected.length-1].end;
        }
    }
    if(start<template.end && end>template.start)throw new Error('补全范围不能包含节奏样例。');
    if(end<=start)throw new Error('样例后没有可补全的小节，请添加空白小节或选择其他范围。');
    var bars=all.filter(function(m){return m.start>=start && m.end<=end;});
    if(bars.length>128)throw new Error('一次最多补全 128 小节。');
    for(var i=0;i<bars.length;i++) {
        var sample=template.bars[i%template.bars.length];
        if(bars[i].end-bars[i].start!==sample.end-sample.start || bars[i].numerator!==sample.numerator || bars[i].denominator!==sample.denominator)
            throw new Error('补全小节与对应样例的拍号／长度不同，请分段操作。');
    }
    return {start:start,end:end,bars:bars};
}
function chordAt(events,tick) {
    var found=null;for(var i=0;i<events.length;i++){if(events[i].tick>tick)break;found=events[i];}
    if(!found)throw new Error('补全位置缺少 Bass 和弦符号，请先在 Bass 谱表写好和弦。');
    return Music.parse(found.text);
}
function makePlan(data,template,division) {
    var attacks={},cuts=[data.start,data.end];
    for(var t=0;t<template.targets.length;t++) {
        var staff=template.targets[t].staff,rows=[];
        for(var cycle=data.start;cycle<data.end;cycle+=template.length)for(var e=0;e<template.patterns[staff].length;e++) {
            var p=template.patterns[staff][e],start=cycle+p.offset,end=Math.min(start+p.length,data.end);
            if(start>=data.end)continue;
            rows.push({start:start,end:end});cuts.push(start,end);
        }
        attacks[staff]=rows;
    }
    for(var staff in data.rests)data.rests[staff].forEach(function(r){cuts.push(r.start,r.end);});
    data.events.forEach(function(e){if(e.tick>data.start && e.tick<data.end)cuts.push(e.tick);});
    data.bass.forEach(function(n){cuts.push(Math.max(data.start,n.start),Math.min(data.end,n.end));});
    data.fixed.forEach(function(n){cuts.push(Math.max(data.start,n.start),Math.min(data.end,n.end));});
    cuts.sort(function(a,b){return a-b;});var unique=[];for(var i=0;i<cuts.length;i++)if(!i || cuts[i]!==cuts[i-1])unique.push(cuts[i]);
    var pieces=[],previous={};
    for(var i=0;i+1<unique.length;i++) {
        var start=unique[i],end=unique[i+1];if(end<=start)continue;
        var bass=data.bass.filter(function(n){return n.start<end && n.end>start;});
        if(!bass.length)continue;
        var active=template.targets.filter(function(t){return attacks[t.staff].some(function(a){return a.start<=start && a.end>=end;}) &&
            (data.rests[t.staff] || []).some(function(r){return r.start<=start && r.end>=end;});});
        if(!active.length)continue;
        var chord=chordAt(data.events,start);if(chord.silent)continue;
        var constraints=data.fixed.filter(function(n){return n.start<end && n.end>start;});
        bass.forEach(function(n){constraints.push({staff:-1,profile:'bass',pitch:n.pitch});});
        var tones=Music.voice(chord,active,previous,data.solo.filter(function(n){return n.start<end && n.end>start;}),constraints);
        for(var t=0;t<active.length;t++) {
            var staff=active[t].staff,attack=attacks[staff].filter(function(a){return a.start<=start && a.end>=end;})[0];
            pieces.push({staff:staff,start:start,end:end,pitch:tones.pitches[staff],tpc:tones.tpcs[staff],attack:attack.start});
            previous[staff]=tones.pitches[staff];
        }
    }
    pieces.sort(function(a,b){return a.staff-b.staff || a.start-b.start;});
    var merged=[];
    for(var i=0;i<pieces.length;i++) {
        var p=pieces[i],last=merged[merged.length-1];
        if(last && last.staff===p.staff && last.end===p.start && last.attack===p.attack && last.pitch===p.pitch && last.tpc===p.tpc)last.end=p.end;
        else merged.push(p);
    }
    var notes=[];
    merged.forEach(function(p){var tick=p.start;Music.durations(p.end-p.start,division).forEach(function(d){notes.push({staff:p.staff,tick:tick,end:tick+d.ticks,pitch:p.pitch,tpc:p.tpc,n:d.n,d:d.d});tick+=d.ticks;});});
    if(notes.length>4096)throw new Error('本次音符过多，请缩小补全范围。');
    if(!notes.length)throw new Error('补全范围没有可写入的位置，请检查 Bass、和弦和伴唱空白。');
    return {notes:notes};
}
function generate(score,template,enums,division,fraction) {
    if(names(score)!==template.names)throw new Error('谱表已变化，请重新记录样例。');
    var fresh=capture(score,enums,template.bassStaff,template.soloStaff,division,fraction,{start:template.start,end:template.end});
    if(fresh.signature!==template.signature)throw new Error('样例节奏已变化，请重新记录。');
    var range=targetRange(score,template),data={start:range.start,end:range.end,
        events:events(score,enums,template.bassStaff,range.end),
        bass:Bass.notes(score,template.bassStaff,enums,range.start,range.end),
        solo:Bass.notes(score,template.soloStaff,enums,range.start,range.end),
        fixed:Bass.fixedNotes(score,Writer.targets(score),enums,range.start,range.end)};
    // Bass is supplied separately; exclude its duplicate fixed records.
    data.fixed=data.fixed.filter(function(n){return n.staff!==template.bassStaff;});
    var rests=Bass.rests(score,template.targets,enums,range.start,range.end);data.rests=rests.rows;
    var plan=makePlan(data,template,division),started=false;
    try {score.startCmd('Jingwen rhythm sample');started=true;Writer.write(score,plan,enums,fraction,division);score.endCmd();started=false;
        return {written:plan.notes.length,skipped:rests.protectedCount,start:range.start,end:range.end};
    } catch(error){if(started)score.endCmd(true);throw error;}
}
