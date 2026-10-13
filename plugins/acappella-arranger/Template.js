.pragma library
.import "NativeInstruments.js" as NativeInstruments

function escapeXml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function voices(options) {
    var list = [];
    function add(enabled, name, shortName, sound, clef, line, octave, program) {
        if (enabled) list.push({name:name, shortName:shortName, sound:clef === 'percussion' ? sound : 'keyboard.piano',
            clef:clef, line:line, octave:octave || 0, program:program || 1});
    }
    var solos = options.solos || (options.solo ? [{clef:options.soloClef || 'treble'}] : []);
    for (var s = 0; s < solos.length; s++) {
        var clef = solos[s].clef || 'treble';
        var name = solos.length === 1 ? 'Solo' : 'Solo ' + (s+1);
        add(true, name, name, 'voice', clef === 'bass' ? 'F' : 'G',
            clef === 'bass' ? 4 : 2, clef === 'tenor' ? -1 : 0);
    }
    add(options.soprano, 'Soprano', 'S.', 'voice.soprano', 'G', 2);
    add(options.alto, 'Alto', 'A.', 'voice.alto', 'G', 2);
    add(options.tenor, 'Tenor', 'T.', 'voice.tenor', 'G', 2, -1);
    add(options.baritone, 'Baritone', 'Bar.', 'voice.baritone', 'F', 4);
    add(options.bass, 'Bass', 'B.', 'voice.bass', 'F', 4);
    add(options.beatbox, 'Beatbox', 'BB', 'drum-set', 'percussion', 2);
    add(options.rap, 'Rap', 'Rap', 'voice', 'G', 2);
    return list;
}

function build(options) {
    var parts = voices(options);
    if (!parts.length) throw new Error('请至少选择一个声部。');
    var bars = Number(options.bars), beats = Number(options.beats), beatType = Number(options.beatType);
    var fifths = Number(options.fifths), tempo = Number(options.tempo);
    if (!isFinite(bars) || bars !== Math.floor(bars) || bars < 1 || bars > 256) throw new Error('小节数需为 1–256。');
    if ([2,3,4,6].indexOf(beats) < 0 || [4,8].indexOf(beatType) < 0) throw new Error('拍号无效。');
    if (!isFinite(fifths) || fifths !== Math.floor(fifths) || fifths < -7 || fifths > 7) throw new Error('调号无效。');
    if (!isFinite(tempo) || tempo < 30 || tempo > 240) throw new Error('速度需为 30–240 BPM。');
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">';
    xml += '<work><work-title>' + escapeXml(options.title || 'A Cappella') + '</work-title></work>';
    if (options.arranger) xml += '<identification><creator type="arranger">' + escapeXml(options.arranger) + '</creator></identification>';
    xml += '<part-list>';
    var pitchedChannel = 0;
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i], channel;
        if (part.clef === 'percussion') channel = 10;
        else { pitchedChannel++; if (pitchedChannel === 10) pitchedChannel++; channel = pitchedChannel; }
        xml += '<score-part id="P' + (i+1) + '"><part-name>' + part.name + '</part-name><part-abbreviation>' + part.shortName + '</part-abbreviation>';
        xml += '<score-instrument id="I' + (i+1) + '"><instrument-name>' + (part.clef === 'percussion' ? 'Drumset' : 'Piano') + '</instrument-name><instrument-sound>' + part.sound + '</instrument-sound></score-instrument>';
        xml += '<midi-instrument id="I' + (i+1) + '"><midi-channel>' + channel + '</midi-channel><midi-program>' + part.program + '</midi-program>';
        if (part.clef === 'percussion') xml += '<midi-unpitched>39</midi-unpitched>';
        xml += '</midi-instrument></score-part>';
    }
    xml += '</part-list>';
    for (var p = 0; p < parts.length; p++) {
        var voice = parts[p];
        xml += '<part id="P' + (p+1) + '">';
        for (var m = 1; m <= bars; m++) {
            xml += '<measure number="' + m + '">';
            if (m === 1) {
                xml += '<attributes><divisions>8</divisions>';
                if (voice.clef !== 'percussion') xml += '<key><fifths>' + fifths + '</fifths></key>';
                xml += '<time><beats>' + beats + '</beats><beat-type>' + beatType + '</beat-type></time><staves>1</staves><clef><sign>' + voice.clef + '</sign><line>' + voice.line + '</line>';
                if (voice.octave) xml += '<clef-octave-change>' + voice.octave + '</clef-octave-change>';
                xml += '</clef></attributes>';
                if (p === 0) xml += '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + tempo + '</per-minute></metronome></direction-type><sound tempo="' + tempo + '"/></direction>';
            }
            xml += '<note><rest measure="yes"/><duration>' + (beats*32/beatType) + '</duration></note></measure>';
        }
        xml += '</part>';
    }
    return xml + '</score-partwise>';
}

function fileStem(title) {
    var stem = String(title || '').replace(/^\s+|\s+$/g, '').replace(/\.[mM][sS][cC][zZxX]$/, '').replace(/\.musicxml$/i, '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
    if (!stem || stem === '.' || stem === '..') stem = 'A Cappella';
    return stem.substring(0, 100);
}

// Native defaults survive MuseScore's template workflow clearing its measures.
function buildNative(options) {
    build(options); // Reuse parameter validation.
    var parts = voices(options);
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.70"><Score><Division>480</Division>';
    xml += '<metaTag name="workTitle">' + escapeXml(options.title || 'A Cappella') + '</metaTag>';
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var percussion = part.clef === 'percussion';
        var clef = percussion ? 'PERC' : part.clef === 'F' ? 'F' : part.octave === -1 ? 'G8vb' : 'G';
        var instrument = percussion ? NativeInstruments.drumkit : NativeInstruments.piano;
        // One piano instrument on ONE vocal staff, with its own default clef.
        instrument = instrument.replace(/<clef[^>]*>[\s\S]*?<\/clef>/g, '');
        instrument = instrument.replace('<instrumentId>', '<clef>' + clef + '</clef><instrumentId>');
        instrument = instrument.replace(/<longName>[\s\S]*?<\/longName>/g, '<longName>' + escapeXml(part.name) + '</longName>')
            .replace(/<shortName>[\s\S]*?<\/shortName>/g, '<shortName>' + escapeXml(part.shortName) + '</shortName>')
            .replace(/<trackName>[\s\S]*?<\/trackName>/g, '<trackName>' + escapeXml(part.name) + '</trackName>');
        xml += '<Part><Staff id="' + (i+1) + '"><StaffType group="' + (percussion ? 'percussion' : 'pitched') + '">';
        xml += '<name>' + (percussion ? 'perc5Line' : 'stdNormal') + '</name>';
        if (percussion) xml += '<keysig>0</keysig>';
        xml += '</StaffType><defaultClef>' + clef + '</defaultClef></Staff>';
        xml += '<trackName>' + escapeXml(part.name) + '</trackName>' + instrument + '</Part>';
    }
    for (var p = 0; p < parts.length; p++) {
        xml += '<Staff id="' + (p+1) + '"><Measure><voice><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>';
        xml += '<Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure></Staff>';
    }
    return xml + '</Score></museScore>';
}
