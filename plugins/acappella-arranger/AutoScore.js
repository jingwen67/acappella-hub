.pragma library
.import "ChordEngine.js" as Engine
.import "ChordScore.js" as Chords

function saved(score) {
    try {
        var data=JSON.parse(score.metaTag('jingwenArrangement') || '{}');
        if(data && data.version===1 && data.bars && typeof data.bars==='object')return data;
    } catch(error) {}
    return {version:1,bars:{}};
}
// Metadata itself is not undoable in MuseScore. Keep score-state checkpoints so
// undo/redo can recover ownership without treating a manually edited bar as owned.
function checkpoint(score,bar,staffs,enums,sourceIndex) {
    var rows=tracks(score,staffs,enums,bar.start,bar.end),result=[];
    for(var i=0;i<staffs.length;i++)result.push([staffs[i],fingerprint(rows[staffs[i]],bar)]);
    var harmony=symbols(score,enums,sourceIndex).filter(function(h){return h.tick===bar.start;})
        .map(function(h){return [h.text,h.raw,h.color];});
    return JSON.stringify([result,harmony]);
}
function reconcile(score,meta,enums) {
    var history=meta.history || {};
    for(var key in history) {
        var entries=history[key];
        for(var i=entries.length-1;i>=0;i--) {
            var entry=entries[i];
            if(checkpoint(score,{start:Number(key),end:entry.end},entry.staffs,enums,entry.source)===entry.state) {
                if(entry.owner)meta.bars[key]=JSON.parse(JSON.stringify(entry.owner));
                else delete meta.bars[key];
                break;
            }
        }
    }
}
function remember(meta,score,bar,staffs,enums,sourceIndex) {
    if(!meta.history)meta.history={};
    var entries=meta.history[bar.start] || [],entry={end:bar.end,staffs:staffs.slice(),source:sourceIndex,
        state:checkpoint(score,bar,staffs,enums,sourceIndex),
        owner:meta.bars[bar.start]?JSON.parse(JSON.stringify(meta.bars[bar.start])):null};
    if(!entries.length || JSON.stringify(entries[entries.length-1])!==JSON.stringify(entry))entries.push(entry);
    // Keep a bounded history. Older unmatched states remain protected.
    meta.history[bar.start]=entries.slice(-32);
}
function source(score,index) {
    if(index>=0 && index<score.nstaves && !score.staves[index].part.hasDrumStaff)return index;
    for(var s=0;s<score.nstaves;s++)if(/^solo/i.test(Engine.plain(score.staves[s].part.longName || score.staves[s].part.partName)))return s;
    for(var p=0;p<score.nstaves;p++)if(!score.staves[p].part.hasDrumStaff)return p;
    throw new Error('没有可用的旋律谱表。');
}
function symbols(score,enums,staff) {
    var result=[],segment=score.firstSegment(enums.all);
    while(segment) {
        for(var a=0;a<segment.annotations.length;a++) {
            var item=segment.annotations[a];
            if(item.type===enums.harmony && Math.floor(item.track/4)===staff)
                result.push({tick:segment.tick,text:Engine.plain(item.text),raw:String(item.text),color:String(item.color),item:item});
        }
        segment=segment.next;
    }
    return result;
}
function read(score,enums,index,division,fractionFromTicks) {
    var meta=saved(score);
    reconcile(score,meta,enums);
    var selection=score.selection,start=selection.isRange && selection.startSegment?selection.startSegment.tick:0;
    var end=selection.isRange && selection.endSegment?selection.endSegment.tick:
        Chords.fractionTicks(score.lastMeasure.tick)+Chords.fractionTicks(score.lastMeasure.ticks);
    var preferred=index,ownerMinor;
    if(preferred<0 && selection.isRange) {
        var keys=Object.keys(meta.bars).map(Number).sort(function(a,b){return a-b;});
        for(var k=0;k<keys.length;k++) {
            var owner=meta.bars[keys[k]];
            if(keys[k]<end && owner.end>start && typeof owner.source==='number') {
                preferred=owner.source;ownerMinor=owner.minor;break;
            }
        }
    }
    if(preferred<0 && typeof meta.source==='number')preferred=meta.source;
    var staff=source(score,preferred);
    var notes=[],cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=0;cursor.rewind(0);
    while(cursor.segment) {
        var element=cursor.element;
        if(element && element.type===enums.chord && element.notes.length) {
            var pitch=0;
            for(var n=0;n<element.notes.length;n++)pitch=Math.max(pitch,element.notes[n].pitch);
            notes.push({start:cursor.tick,end:cursor.tick+Chords.fractionTicks(element.actualDuration),pitch:pitch});
        }
        if(!cursor.next())break;
    }
    var allSymbols=symbols(score,enums,staff),bars=[],measure=score.firstMeasure,number=1;
    while(measure) {
        var begin=Chords.fractionTicks(measure.tick),finish=begin+Chords.fractionTicks(measure.ticks);
        if(begin>=end)break;
        if(finish>start) {
            var time=measure.timesigNominal || measure.timesigActual;
            var denominator=time?Number(time.denominator):4;
            var beat=division*4/(denominator>0?denominator:4);
            var bar={start:begin,end:finish,number:number,beat:beat,
                fifths:score.staves[staff].key(fractionFromTicks(begin)),
                notes:notes.filter(function(x){return x.start<finish && x.end>begin;})};
            var existing=meta.bars[begin];
            if(existing && (existing.source===undefined || existing.source===staff))bar.current=existing.chord;
            var active=null;
            for(var h=0;h<allSymbols.length;h++) {
                if(allSymbols[h].tick<=begin)active=allSymbols[h];
                else if(allSymbols[h].tick<finish)bar.blocked=true;
                else break;
            }
            if(active) {
                var owner=meta.bars[active.tick];
                if(!owner || owner.source!==undefined && owner.source!==staff ||
                    !owner.harmony || owner.harmony.text!==active.text)bar.fixed=active.text;
            }
            bars.push(bar);
        }
        measure=measure.nextMeasure;number++;
    }
    if(!bars.length)throw new Error('没有可用的小节。');
    if(bars.length>128)throw new Error('本版一次最多处理 128 个小节，请分段选择。');
    var before=null,after=null,barKeys=Object.keys(meta.bars).map(Number).sort(function(a,b){return a-b;});
    for(var k=0;k<barKeys.length;k++) {
        var record=meta.bars[barKeys[k]],value=record.chord;
        if(!value || value==='休止')continue;
        if(barKeys[k]<bars[0].start)before=value;
        else if(barKeys[k]>=bars[bars.length-1].end && !after)after=value;
    }
    var data={source:staff,start:bars[0].start,end:bars[bars.length-1].end,bars:bars,before:before,after:after,
        savedMinor:typeof ownerMinor==='boolean'?ownerMinor:
            meta.source===staff && typeof meta.minor==='boolean'?meta.minor:undefined,meta:meta};
    data.snapshot=JSON.stringify({source:staff,bars:bars,savedMinor:data.savedMinor});
    return data;
}
function tracks(score,staffs,enums,start,end) {
    var result={};
    for(var s=0;s<staffs.length;s++) {
        var staff=staffs[s];if(staff<0 || staff>=score.nstaves)continue;
        var rows=[];
        for(var voice=0;voice<4;voice++) {
            var cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=voice;cursor.rewind(0);
            while(cursor.segment && cursor.tick<end) {
                var element=cursor.element;
                if(element && (element.type===enums.chord || element.type===enums.rest)) {
                    var finish=cursor.tick+Chords.fractionTicks(element.actualDuration);
                    if(finish>start) {
                        var pitches=[],lyrics=[];
                        if(element.type===enums.chord)for(var n=0;n<element.notes.length;n++) {
                            var note=element.notes[n];
                            pitches.push([note.pitch,note.tpc,String(note.color),!!note.tieBack,!!note.tieForward,
                                note.elements?note.elements.length:0,String(note.headGroup),String(note.headType),
                                String(note.small),String(note.visible),String(note.veloOffset),String(note.tuning),String(note.play)]);
                        }
                        if(element.lyrics)for(var l=0;l<element.lyrics.length;l++)lyrics.push(String(element.lyrics[l].text || ''));
                        rows.push({start:cursor.tick,end:finish,voice:voice,type:element.type,
                            pitches:pitches,lyrics:lyrics,tuplet:!!element.tuplet,
                            articulations:element.articulations?element.articulations.length:0,
                            style:[String(element.stemDirection),String(element.beamMode),String(element.small),String(element.visible)]});
                    }
                }
                if(!cursor.next())break;
            }
        }
        result[staff]=rows;
    }
    return result;
}
function fingerprint(rows,bar) {
    return JSON.stringify((rows || []).filter(function(x){return x.start<bar.end && x.end>bar.start;}));
}
function occupied(rows,bar) {
    return (rows || []).some(function(x){return x.start<bar.end && x.end>bar.start &&
        (x.pitches.length || x.tuplet || x.lyrics.length || x.articulations);});
}
function clear(score,staff,bar,enums,fractionFromTicks,division) {
    var at=bar.start,chunks=Engine.durations(bar.end-bar.start,division);
    for(var i=0;i<chunks.length;i++) {
        var cursor=Chords.cursorAt(score,staff,at,fractionFromTicks);
        if(!cursor.segment || !cursor.element || (cursor.element.type!==enums.chord && cursor.element.type!==enums.rest))
            throw new Error('无法定位原编曲音符，已取消此次替换。');
        cursor.setDuration(chunks[i].n,chunks[i].d);cursor.addRest();at+=chunks[i].ticks;
    }
}
function execute(score,data,path,targets,enums,division,fractionFromTicks,newElement,variant) {
    if(!targets.length)throw new Error('旋律之外没有识别到伴唱声部，请先用建谱功能建立声部。');
    var meta=data.meta,staffs=targets.map(function(t){return t.staff;});
    for(var k in meta.bars)for(var r=0;r<(meta.bars[k].records || []).length;r++) {
        var staff=meta.bars[k].records[r].staff;if(staffs.indexOf(staff)<0)staffs.push(staff);
    }
    var before=tracks(score,staffs,enums,data.start,data.end),live=symbols(score,enums,data.source),writable={},protectedCount=0;
    for(var b=0;b<data.bars.length;b++) {
        var bar=data.bars[b],old=meta.bars[bar.start],blocked=!!bar.blocked,owned={};
        if(old) {
            if(old.source!==undefined && old.source!==data.source)blocked=true;
            for(var o=0;o<(old.records || []).length;o++) {
                var record=old.records[o];owned[record.staff]=true;
                if(record.staff===data.source || record.staff<0 || record.staff>=score.nstaves ||
                    fingerprint(before[record.staff],bar)!==record.signature)blocked=true;
            }
            if(old.harmony) {
                var matches=live.filter(function(h){return h.tick===bar.start;});
                if(matches.length!==1 || matches[0].text!==old.harmony.text ||
                    old.harmony.raw!==undefined && matches[0].raw!==old.harmony.raw ||
                    old.harmony.color!==undefined && matches[0].color!==old.harmony.color)blocked=true;
            }
        }
        for(var t=0;t<targets.length;t++)if(!owned[targets[t].staff] && occupied(before[targets[t].staff],bar))blocked=true;
        if(blocked){protectedCount++;continue;}
        if(bar.notes.length || old)writable[bar.start]=true;
    }
    if(!Object.keys(writable).length)return {written:0,protectedCount:protectedCount,labels:[]};
    var started=false,originalMeta=score.metaTag('jingwenArrangement') || '';
    for(var b=0;b<data.bars.length;b++)if(writable[data.bars[b].start])
        remember(meta,score,data.bars[b],staffs,enums,data.source);
    try {
        score.startCmd('Jingwen automatic arrangement');started=true;
        for(var i=0;i<data.bars.length;i++) {
            var bar=data.bars[i];if(!writable[bar.start])continue;
            var old=meta.bars[bar.start],choice=path.bars[i];
            if(old)for(var r=0;r<(old.records || []).length;r++)clear(score,old.records[r].staff,bar,enums,fractionFromTicks,division);
            var matches=live.filter(function(h){return h.tick===bar.start;});
            var text=choice.chord?choice.label:'N.C.';
            if(old && old.harmony && matches.length===1)matches[0].item.text=text;
            else if(!matches.length && choice.chord && !bar.fixed) {
                var cursor=Chords.cursorAt(score,data.source,bar.start,fractionFromTicks);
                if(!cursor.segment)throw new Error('无法添加和弦符号，已取消此次生成。');
                // MuseScore 4.7 Harmony::setProperty(TEXT) dereferences explicitParent.
                // Attach to the segment before assigning text; detached harmony is unsafe.
                var harmony=newElement(enums.harmony);cursor.add(harmony);harmony.text=text;
            }
        }
        var input=Chords.read(score,enums,data.source,targets,{start:data.start,end:data.end,
            events:path.bars.map(function(b){return {tick:b.start,text:b.chord?b.label:'N.C.'};})});
        for(var t=0;t<targets.length;t++) {
            var windows=[];
            for(var b=0;b<data.bars.length;b++) {
                var bar=data.bars[b];if(!writable[bar.start])continue;
                for(var w=0;w<(input.rests[targets[t].staff] || []).length;w++) {
                    var rest=input.rests[targets[t].staff][w],start=Math.max(rest.start,bar.start),end=Math.min(rest.end,bar.end);
                    if(end>start)windows.push({start:start,end:end});
                }
            }
            input.rests[targets[t].staff]=windows;
        }
        if(variant) {
            input.initialPitches={};
            for(var t=0;t<targets.length;t++)input.initialPitches[targets[t].staff]=Engine.ranges[targets[t].profile].center+5;
        }
        var plan=Engine.plan(input,targets,division);
        Chords.write(score,plan,enums,fractionFromTicks,division);
        // Capture ownership after rendering has canonicalized note/text values.
        if(score.doLayout)score.doLayout(fractionFromTicks(data.start),fractionFromTicks(data.end));
        var after=tracks(score,staffs,enums,data.start,data.end),symbolsAfter=symbols(score,enums,data.source);
        for(var b=0;b<data.bars.length;b++) {
            var bar=data.bars[b];if(!writable[bar.start])continue;
            var records=[],choice=path.bars[b];
            for(var t=0;t<targets.length;t++)records.push({staff:targets[t].staff,signature:fingerprint(after[targets[t].staff],bar)});
            var found=symbolsAfter.filter(function(h){return h.tick===bar.start;});
            var wasOwned=meta.bars[bar.start] && meta.bars[bar.start].harmony;
            meta.bars[bar.start]={source:data.source,end:bar.end,minor:path.minor,chord:choice.chord?choice.label:'休止',records:records,
                harmony:found.length===1 && (!bar.fixed || wasOwned)?{text:found[0].text,raw:found[0].raw,color:found[0].color}:null};
        }
        for(var b=0;b<data.bars.length;b++)if(writable[data.bars[b].start])
            remember(meta,score,data.bars[b],staffs,enums,data.source);
        meta.source=data.source;meta.minor=path.minor;
        score.setMetaTag('jingwenArrangement',JSON.stringify(meta));
        score.endCmd();started=false;
        return {written:plan.notes.length,protectedCount:protectedCount,
            labels:path.bars.filter(function(b){return writable[b.start];}).map(function(b){return b.label;})};
    } catch(error) {
        if(started)score.endCmd(true);
        score.setMetaTag('jingwenArrangement',originalMeta);
        throw error;
    }
}
