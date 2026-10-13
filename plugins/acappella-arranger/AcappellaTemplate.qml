import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import "Template.js" as Template

MuseScore {
    id: root
    title: "阿卡贝拉编曲助手 · Jingwen"
    description: "Create an a cappella score with selected voices, key, meter and tempo."
    version: "0.1.5"
    menuPath: "Plugins.Acappella Arranger - Jingwen"
    pluginType: "dialog"
    requiresScore: false
    width: 480
    height: 650
    property bool busy: false
    property var nativeModel: null
    property var pendingVoices: []
    property string pendingTitle: ''
    property int setupAttempts: 0
    onRun: { status.text = "选择声部后创建新谱。"; }

    function createTemplate() {
        if (busy) return;
        busy = true;
        try {
            if (mscoreMajorVersion !== 4 || mscoreMinorVersion < 7)
                throw new Error('原生建谱试用版需要 MuseScore Studio 4.7.x。');
            var meter = meters.currentText.split('/');
            var options = {title: scoreTitle.text.trim() || 'A Cappella', arranger: arranger.text,
                bars: bars.value, beats: Number(meter[0]), beatType: Number(meter[1]),
                fifths: keys.currentIndex - 7, tempo: tempo.value,
                solo: solo.checked, soloClef: ['treble','tenor','bass'][soloClef.currentIndex],
                soprano: soprano.checked, alto: alto.checked, tenor: tenor.checked,
                baritone: baritone.checked, bass: bass.checked, beatbox: beatbox.checked, rap: rap.checked};
            Template.build(options); // Validate settings; no file is written.
            var definitions = Template.voices(options);
            var ids = {Soprano:'soprano', Alto:'alto', Tenor:'tenor',
                Baritone:'baritone', Bass:'bass', Beatbox:'drumset', Rap:'soprano'};
            var instruments = [];
            for (var i = 0; i < definitions.length; i++) {
                var definition = definitions[i];
                var id = definition.name === 'Solo'
                    ? (definition.clef === 'F' ? 'bass' : definition.octave === -1 ? 'tenor' : 'soprano')
                    : ids[definition.name];
                instruments.push({instrumentId:id, isExistingPart:false, isSoloist:definition.name === 'Solo'});
            }
            if (!nativeModel) {
                nativeModel = Qt.createQmlObject(
                    'import QtQuick; import MuseScore.Project; NewScoreModel {}',
                    root, 'JingwenNativeScoreModel');
            }
            pendingVoices = definitions;
            pendingTitle = options.title;
            var created = nativeModel.createScore({
                title:options.title, subtitle:'', composer:'', lyricist:'', copyright:'',
                templatePath:'', instruments:instruments, scoreOrder:{id:'custom', customized:true},
                measureCount:options.bars, timeSignatureType:0,
                timeSignature:{numerator:options.beats, denominator:options.beatType},
                keySignature:{key:options.fifths}, withPickupMeasure:false,
                pickupTimeSignature:{numerator:1, denominator:4},
                withTempo:true, tempo:{value:options.tempo, noteIcon:0, withDot:false}
            });
            if (!created) throw new Error('MuseScore 未能创建新谱。');
            setupAttempts = 0;
            finishNative.start();
            status.text = '新谱已创建，正在设置声部音色…';
        } catch (error) {
            status.text = '创建失败：' + error.message;
            busy = false;
        }
    }

    function finishNativeScore() {
        var score = curScore;
        if (!score || score.title !== pendingTitle || score.parts.length !== pendingVoices.length) {
            if (++setupAttempts < 30) { finishNative.start(); return; }
            status.text = '新谱已创建，但尚未连接到新谱。请截图此提示。';
            busy = false;
            return;
        }
        var tick = fraction(0, 1);
        var namingStarted = false;
        try {
            score.startCmd('Jingwen voice names');
            namingStarted = true;
            for (var n = 0; n < pendingVoices.length; n++) {
                score.setInstrumentName(score.parts[n], tick, pendingVoices[n].name);
                score.setInstrumentAbbreviature(score.parts[n], tick, pendingVoices[n].shortName);
            }
            if (arranger.text.trim()) score.setMetaTag('arranger', arranger.text.trim());
            score.endCmd();
            namingStarted = false;
        } catch (error) {
            if (namingStarted) score.endCmd(true);
            status.text = '声部命名失败：' + error.message;
            busy = false;
            return;
        }
        var failures = [];
        for (var i = 0; i < pendingVoices.length; i++) {
            var definition = pendingVoices[i];
            if (definition.name === 'Beatbox') continue;
            var started = false;
            try {
                var part = score.parts[i];
                var originalClef = score.staves[i].clefType(tick);
                score.startCmd('Jingwen piano - ' + definition.name);
                started = true;
                score.replaceInstrument(part, 'piano');
                var clef = newElement(Element.CLEF);
                clef.concertClefType = originalClef;
                clef.transposingClefType = originalClef;
                var cursor = score.newCursor();
                cursor.staffIdx = i;
                cursor.voice = 0;
                cursor.rewind(0);
                cursor.add(clef);
                score.setInstrumentName(part, tick, definition.name);
                score.setInstrumentAbbreviature(part, tick, definition.shortName);
                score.endCmd();
                started = false;
            } catch (error) {
                if (started) score.endCmd(true);
                failures.push(definition.name + ': ' + error.message);
            }
        }
        status.text = failures.length
            ? '声部名称已设置；部分 Piano 设置失败：' + failures.join('；')
            : '未保存的新谱已创建！需要保留时按 ⌘S / Ctrl+S。';
        busy = false;
    }

    Timer { id: finishNative; interval: 100; repeat: false; onTriggered: root.finishNativeScore() }

    ScrollView {
        anchors.fill: parent
        anchors.margins: 20
        clip: true
        ColumnLayout {
            width: 430
            spacing: 10
            Label { text: "阿卡贝拉编曲助手 · Jingwen"; font.pixelSize: 23 }
            Label { text: "v0.1.5 · 一键建谱" }
            Label { text: "谱名" }
            TextField { id: scoreTitle; text: "A Cappella"; Layout.fillWidth: true }
            Label { text: "编曲者（可留空）" }
            TextField { id: arranger; placeholderText: "Arranged by…"; Layout.fillWidth: true }
            RowLayout {
                Label { text: "小节" }
                SpinBox { id: bars; from: 1; to: 256; value: 32; editable: true }
                Label { text: "拍号" }
                ComboBox { id: meters; model: ['4/4','3/4','6/8','2/4']; Layout.fillWidth: true }
            }
            RowLayout {
                Label { text: "调号" }
                ComboBox { id: keys; model: ['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯']; currentIndex: 7; Layout.fillWidth: true }
                Label { text: "BPM" }
                SpinBox { id: tempo; from: 30; to: 240; value: 100; editable: true }
            }
            Label { text: "调号按大调名称显示；BPM 为四分音符速度。"; font.pixelSize: 12 }
            Label { text: "声部 · 从上到下排列"; font.bold: true }
            RowLayout {
                CheckBox { id: solo; text: "Solo"; checked: true }
                ComboBox { id: soloClef; model: ['高音谱号','高音谱号 ↓8','低音谱号']; Layout.fillWidth: true; enabled: solo.checked }
            }
            GridLayout {
                columns: 2
                CheckBox { id: soprano; text: "Soprano"; checked: true }
                CheckBox { id: alto; text: "Alto"; checked: true }
                CheckBox { id: tenor; text: "Tenor · ↓8"; checked: true }
                CheckBox { id: baritone; text: "Baritone"; checked: true }
                CheckBox { id: bass; text: "Bass"; checked: true }
                CheckBox { id: beatbox; text: "Beatbox · 打击乐谱"; checked: true }
                CheckBox { id: rap; text: "Rap" }
            }
            Button { text: root.busy ? "正在创建…" : "创建新谱"; enabled: !root.busy; Layout.fillWidth: true; onClicked: root.createTemplate() }
            Label { id: status; text: ""; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
}
