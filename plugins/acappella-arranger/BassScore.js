.pragma library
.import "BassVoicing.js" as Music
.import "BassWrite.js" as Writer
.import "BassHarmony.js" as Harmony

function detect(score,bassIndex,soloIndex) {
    var bass=bassIndex,solo=soloIndex;
    for(var s=0;s<score.nstaves;s++) {
        var name=Music.plain(score.staves[s].part.longName || score.staves[s].part.partName);
        if(bass<0 && Music.profile(name)==='bass')bass=s;
        if(solo===-1 && /^solo/i.test(name))solo=s;
    }
    if(bass<0 || bass>=score.nstaves || score.staves[bass].part.hasDrumStaff)throw new Error('没有找到 Bass，请在设置中选择低音来源。');
    if(solo===bass)throw new Error('Solo 与 Bass 不能使用同一谱表。');
    return {bass:bass,solo:solo};
}
function notes(score,staff,enums,start,end) {
    if(staff<0)return [];
    var rows=[],cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=0;cursor.rewind(0);
    while(cursor.segment && cursor.tick<end) {
        var e=cursor.element;
        if(e && e.type===enums.chord && cursor.tick+Writer.fractionTicks(e.actualDuration)>start) {
            if(e.tuplet)throw new Error('本版请先选择不含连音的 Bass／Solo 片段。');
            if(e.notes.length!==1)throw new Error('Bass／Solo 来源第一音轨需为单音旋律。');
            var n=e.notes[0],letter=0;
            for(var l=0;l<7;l++)if((n.tpc-Music.naturalTpc[l])%7===0){letter=l;break;}
            rows.push({start:cursor.tick,end:cursor.tick+Writer.fractionTicks(e.actualDuration),pitch:n.pitch,tpc:n.tpc,letter:letter,tied:!!n.tieBack});
        }
        if(!cursor.next())break;
    }
    return rows;
}
function read(score,enums,bassIndex,soloIndex,division,fraction) {
    var sources=detect(score,bassIndex,soloIndex),sel=score.selection;
    var start=sel.isRange && sel.startSegment?sel.startSegment.tick:0;
    var end=sel.isRange && sel.endSegment?sel.endSegment.tick:Writer.fractionTicks(score.lastMeasure.tick)+Writer.fractionTicks(score.lastMeasure.ticks);
    var measures=[],measure=score.firstMeasure,number=1;
    while(measure) {
        var begin=Writer.fractionTicks(measure.tick),finish=begin+Writer.fractionTicks(measure.ticks);
        if(begin>=end)break;
        if(finish>start){var time=measure.timesigNominal;
            measures.push({start:begin,end:finish,number:number,numerator:Number(time.numerator),denominator:Number(time.denominator),
                unit:division*4/Number(time.denominator),fifths:score.staves[sources.bass].key(fraction(begin))});}
        measure=measure.nextMeasure;number++;
    }
    if(measures.length>128)throw new Error('一次最多处理 128 小节，请分段选择。');
    var data={start:start,end:end,bass:notes(score,sources.bass,enums,start,end),solo:notes(score,sources.solo,enums,start,end),
        measures:measures,bassStaff:sources.bass,soloStaff:sources.solo};
    data.snapshot=JSON.stringify(data);return data;
}
function rests(score,targets,enums,start,end) {
    var result={},protectedCount=0;
    for(var t=0;t<targets.length;t++) {
        var staff=targets[t].staff,blocks=[],protectedNotes=[];
        for(var voice=0;voice<4;voice++) {
            var c=score.newCursor();c.staffIdx=staff;c.voice=voice;c.rewind(0);
            while(c.segment && c.tick<end) {
                var e=c.element;
                if(e){var finish=c.tick+Writer.fractionTicks(e.actualDuration);
                    if(finish>start && (e.type===enums.chord || e.type===enums.rest)) {
                        if(e.type===enums.chord || e.tuplet || e.lyrics && e.lyrics.length)protectedNotes.push({start:c.tick,end:finish});
                        else if(voice===0)blocks.push({start:Math.max(start,c.tick),end:Math.min(finish,end)});
                    }}
                if(!c.next())break;
            }
        }
        result[staff]=blocks.filter(function(b){var blocked=protectedNotes.some(function(n){return n.start<b.end && n.end>b.start;});if(blocked)protectedCount++;return !blocked;});
    }
    return {rows:result,protectedCount:protectedCount};
}
function generate(score,data,slots,chosen,enums,division,fraction,newElement) {
    var targets=Writer.targets(score).filter(function(t){return t.staff!==data.bassStaff && t.staff!==data.soloStaff && t.profile!=='bass';});
    if(!targets.length)throw new Error('没有找到可写入的 Soprano／Alto／Tenor／Baritone。');
    var available=rests(score,targets,enums,data.start,data.end),events=[];
    // Explicit N.C. boundaries prevent accompaniment through bass rests.
    for(var i=0;i<slots.length;i++) {
        if(chosen[i]<0 || chosen[i]>=slots[i].choices.length)throw new Error('候选选择无效，请重新分析。');
        events.push({tick:slots[i].start,text:slots[i].choices[chosen[i]].label});
        if(i+1===slots.length || slots[i+1].start>slots[i].end)events.push({tick:slots[i].end,text:'N.C.'});
    }
    var plan=Music.plan({start:data.start,end:data.end,events:events,rests:available.rows,solo:data.solo},targets,division);
    if(!plan.notes.length)throw new Error('没有可写入的空白伴唱位置；请先撤销上一版或选择空白范围。');
    var started=false;
    try {
        score.startCmd('Jingwen bass harmony');started=true;
        Writer.write(score,plan,enums,fraction,division);
        // Write symbols only where accompaniment was actually generated.
        for(var i=0;i<slots.length;i++) {
            var slot=slots[i];if(!plan.notes.some(function(n){return n.tick>=slot.start && n.tick<slot.end;}))continue;
            var cursor=Writer.cursorAt(score,data.bassStaff,slot.start,fraction),existing=false;
            if(!cursor.segment)continue;
            for(var a=0;a<cursor.segment.annotations.length;a++)if(cursor.segment.annotations[a].type===enums.harmony &&
                Math.floor(cursor.segment.annotations[a].track/4)===data.bassStaff)existing=true;
            if(!existing){var symbol=newElement(enums.harmony);cursor.add(symbol);symbol.text=slot.choices[chosen[i]].label;}
        }
        score.endCmd();started=false;
        return {written:plan.notes.length,protectedCount:available.protectedCount};
    } catch(error){if(started)score.endCmd(true);throw error;}
}
