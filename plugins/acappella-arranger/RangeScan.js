.pragma library

var markerColor = '#d32f2f';
var limits = {
    soprano:{low:55, high:76, label:'G3–E5'},
    alto:{low:50, high:71, label:'D3–B4'},
    tenor:{low:48, high:67, label:'C3–G4'},
    baritone:{low:41, high:64, label:'F2–E4'},
    bass:{low:38, high:null, label:'D2 及以上（未设上限）'}
};
function classify(name, soloProfile) {
    var value = String(name || '').replace(/<[^>]*>/g,'').toLowerCase().replace(/[.\s_\-\d]/g,'');
    if (value.indexOf('solo') === 0) return limits[soloProfile] || null;
    var aliases = {s:'soprano',sop:'soprano',soprano:'soprano',a:'alto',alto:'alto',
        t:'tenor',tenor:'tenor',bar:'baritone',bari:'baritone',baritone:'baritone',b:'bass',bass:'bass'};
    return limits[aliases[value]] || null;
}
function outOfRange(pitch, rule) {
    return !!rule && (pitch < rule.low || (rule.high !== null && pitch > rule.high));
}
function normalizeColor(color) {
    var value=String(color).toLowerCase();
    return value.length === 9 && value.substring(0,3) === '#ff' ? '#'+value.substring(3) : value;
}
function same(a,b) {
    if (!a || !b) return false;
    try { return a.is(b); } catch(error) { return a === b; }
}
function notes(score, chordType, profile) {
    var result=[];
    function append(chord, key, staff, tick, rule) {
        for(var n=0;n<chord.notes.length;n++)
            result.push({note:chord.notes[n],key:key+':'+n,staff:staff,tick:tick,rule:rule});
        for(var g=0;g<chord.graceNotes.length;g++)
            append(chord.graceNotes[g],key+':g'+g,staff,tick,rule);
    }
    for(var staff=0;staff<score.nstaves;staff++) {
        var part=score.staves[staff].part;
        var name=part.longName || part.partName;
        var rule=part.hasDrumStaff ? null : classify(name,profile);
        for(var voice=0;voice<4;voice++) {
            var cursor=score.newCursor();cursor.staffIdx=staff;cursor.voice=voice;cursor.rewind(0);
            while(cursor.segment) {
                if(cursor.element && cursor.element.type === chordType)
                    append(cursor.element,staff+':'+voice+':'+cursor.tick,staff,cursor.tick,rule);
                if(!cursor.next())break;
            }
        }
    }
    return result;
}
function selectionContains(score, item) {
    var selection=score.selection;
    if(selection.isRange && selection.startSegment) {
        var end=selection.endSegment ? selection.endSegment.tick : score.lastMeasure.tick+score.lastMeasure.ticks.ticks;
        return item.staff>=selection.startStaff && item.staff<selection.endStaff
            && item.tick>=selection.startSegment.tick && item.tick<end;
    }
    for(var i=0;i<selection.elements.length;i++) {
        var element=selection.elements[i];
        if(same(element,item.note))return true;
        try { if(element.notes)for(var n=0;n<element.notes.length;n++)if(same(element.notes[n],item.note))return true; }catch(error){}
    }
    return false;
}
function plan(items, saved, mode, contains) {
    var marks={};for(var key in saved)marks[key]=saved[key];
    var edits=[],count=0;
    for(var i=0;i<items.length;i++) {
        var item=items[i],current=String(item.note.color),isMarked=normalizeColor(current)===markerColor;
        var has=Object.prototype.hasOwnProperty.call(marks,item.key);
        if(isMarked && !has) { marks[item.key]='#000000';has=true; }
        if(mode==='clear' || mode==='clearAll') {
            if(mode==='clear' && !contains(item))continue;
            if(has && isMarked)edits.push({note:item.note,color:marks[item.key]});
            if(has)delete marks[item.key];
        } else if(outOfRange(item.note.pitch,item.rule)) {
            count++;
            if(!isMarked){marks[item.key]=current;edits.push({note:item.note,color:markerColor});}
        } else if(has) {
            if(isMarked)edits.push({note:item.note,color:marks[item.key]});
            delete marks[item.key];
        }
    }
    return {marks:marks,edits:edits,count:count};
}
