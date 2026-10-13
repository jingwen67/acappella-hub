.pragma library
.import "ChordEngine.js" as Engine

function targets(score) {
    var rows=[];
    for(var staff=0;staff<score.nstaves;staff++) {
        var part=score.staves[staff].part,name=String(part.longName || part.partName || '');
        var profile=Engine.profile(name);
        if(profile && !part.hasDrumStaff)rows.push({staff:staff,name:Engine.plain(name),profile:profile,selected:true});
    }
    return rows;
}
function fractionTicks(value) {
    return typeof value==='number'?value:value ? Number(value.ticks) : 0;
}
function read(score,enums,sourceStaff,selectedTargets) {
    var selection=score.selection;
    if(!selection.isRange || !selection.startSegment)throw new Error('请先在谱面选取连续的小节范围（蓝色选框）。');
    var start=selection.startSegment.tick;
    var end=selection.endSegment?selection.endSegment.tick:
        fractionTicks(score.lastMeasure.tick)+fractionTicks(score.lastMeasure.ticks);
    if(end<=start)throw new Error('选区范围无效。');
    var byStaff={},segment=score.firstSegment(enums.all);
    while(segment) {
        if(segment.tick>=end)break;
        var annotations=segment.annotations;
        for(var a=0;a<annotations.length;a++) {
            var item=annotations[a];
            if(item.type!==enums.harmony)continue;
            var staff=Math.floor(item.track/4);
            if(!byStaff[staff])byStaff[staff]=[];
            byStaff[staff].push({tick:segment.tick,text:String(item.text || '')});
        }
        segment=segment.next;
    }
    if(sourceStaff<0) {
        for(var s=0;s<score.nstaves;s++)if(byStaff[s] && byStaff[s].length){sourceStaff=s;break;}
    }
    var raw=byStaff[sourceStaff] || [],events=[];
    for(var e=0;e<raw.length;e++) {
        var event=raw[e];
        if(events.length && events[events.length-1].tick===event.tick) {
            if(Engine.plain(events[events.length-1].text)!==Engine.plain(event.text))
                throw new Error('同一位置有不同和弦符号，请先删除重复符号。');
        } else events.push(event);
    }
    if(!events.length)throw new Error('所选来源谱表没有和弦符号。请用 MuseScore 的和弦符号输入（⌘K / Ctrl+K）。');
    var rests={},skipped=0;
    for(var t=0;t<selectedTargets.length;t++) {
        var staff=selectedTargets[t].staff,blocks=[],protectedNotes=[];
        for(var voice=0;voice<4;voice++) {
            var cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=voice;cursor.rewind(0);
            while(cursor.segment && cursor.tick<end) {
                var element=cursor.element;
                if(element && (element.type===enums.chord || element.type===enums.rest)) {
                    var begin=cursor.tick,length=fractionTicks(element.actualDuration),finish=begin+length;
                    if(finish>start) {
                        if(element.type===enums.chord)protectedNotes.push({start:begin,end:finish});
                        else if(voice===0 && begin>=start && length>0 && !element.tuplet)
                            blocks.push({start:begin,end:Math.min(finish,end)});
                    }
                }
                if(!cursor.next())break;
            }
        }
        var eligible=[];
        for(var r=0;r<blocks.length;r++) {
            var blocked=false;
            for(var p=0;p<protectedNotes.length;p++)if(protectedNotes[p].start<blocks[r].end && protectedNotes[p].end>blocks[r].start){blocked=true;break;}
            if(blocked){skipped++;continue;}
            // Adjacent rests can be one long note; native entry splits at barlines.
            if(eligible.length && eligible[eligible.length-1].end===blocks[r].start)
                eligible[eligible.length-1].end=blocks[r].end;
            else eligible.push(blocks[r]);
        }
        skipped+=protectedNotes.length;rests[staff]=eligible;
    }
    return {start:start,end:end,events:events,rests:rests,skipped:skipped,source:sourceStaff,
        startStaff:selection.startStaff,endStaff:selection.endStaff};
}
function cursorAt(score,staff,tick,fractionFromTicks) {
    var cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=0;
    cursor.rewindToFraction(fractionFromTicks(tick));return cursor;
}
function ensureRestAt(score,staff,tick,enums,fractionFromTicks,division) {
    var cursor=cursorAt(score,staff,tick,fractionFromTicks);
    if(cursor.segment && cursor.element && cursor.element.type===enums.rest)return cursor;
    // A chord symbol may occur in the middle of a full-measure rest.
    // Split only the preceding REST, never a note or a tuplet.
    var scan=score.newCursor();scan.staffIdx=staff;scan.voice=0;scan.rewind(0);
    var begin=-1;
    while(scan.segment && scan.tick<tick) {
        var element=scan.element;
        if(element && element.type===enums.rest && !element.tuplet &&
            scan.tick+fractionTicks(element.actualDuration)>tick) {begin=scan.tick;break;}
        if(!scan.next())break;
    }
    if(begin<0)throw new Error('目标位置不在可用休止符内，已取消本次生成。');
    var chunks=Engine.durations(tick-begin,division);
    for(var i=0;i<chunks.length;i++) {
        var gap=cursorAt(score,staff,begin,fractionFromTicks);
        if(!gap.element || gap.element.type!==enums.rest)throw new Error('休止符分割失败，已取消本次生成。');
        gap.setDuration(chunks[i].n,chunks[i].d);gap.addRest();begin+=chunks[i].ticks;
    }
    return cursorAt(score,staff,tick,fractionFromTicks);
}
function write(score,plan,enums,fractionFromTicks,division) {
    for(var i=0;i<plan.notes.length;i++) {
        var item=plan.notes[i],cursor=ensureRestAt(score,item.staff,item.tick,enums,fractionFromTicks,division);
        if(!cursor.segment || cursor.tick!==item.tick || !cursor.element || cursor.element.type!==enums.rest)
            throw new Error('目标休止符位置发生变化，已取消本次生成。');
        cursor.setDuration(item.n,item.d);
        cursor.addNote(item.pitch);
        var segment=score.findSegmentAtTick(enums.chordRest,fractionFromTicks(item.tick));
        var chord=segment?segment.elementAt(item.staff*4):null;
        if(!chord || chord.type!==enums.chord || chord.notes.length!==1 || chord.notes[0].pitch!==item.pitch)
            throw new Error('MuseScore 未能写入预定音符，已取消本次生成。');
        var note=chord.notes[0],count=0;
        while(note) {
            note.tpc=item.tpc;
            var parent=note.parent;
            var noteEnd=fractionTicks(parent.fraction)+fractionTicks(parent.actualDuration);
            if(noteEnd>item.end)throw new Error('写入时值超出预定范围，已取消本次生成。');
            if(!note.tieForward) {
                if(noteEnd!==item.end)throw new Error('写入时值与预定范围不同，已取消本次生成。');
                break;
            }
            note=note.tieForward.endNote;
            if(!note)throw new Error('延音线终点异常，已取消本次生成。');
            if(++count>256)throw new Error('连音链异常，已取消本次生成。');
        }
    }
}
