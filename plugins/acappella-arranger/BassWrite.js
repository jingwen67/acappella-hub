.pragma library
.import "BassVoicing.js" as Engine

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

