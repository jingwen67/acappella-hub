import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import FileIO 3.0
import "Template.js" as Template

MuseScore {
    id: root
    title: "阿卡贝拉编曲助手 · Jingwen"
    description: "Create an a cappella score with selected voices, key, meter and tempo."
    version: "0.1.1"
    menuPath: "Plugins.Acappella Arranger - Jingwen"
    pluginType: "dialog"
    requiresScore: false
    width: 480
    height: 650
    property bool busy: false
    FileIO { id: outputFile; onError: function(message) { status.text = "文件写入失败：" + message; } }
    onRun: { status.text = "选择声部后创建新谱。"; }

    function createTemplate() {
        if (busy) return;
        busy = true;
        try {
            var meter = meters.currentText.split('/');
            var xml = Template.build({title: scoreTitle.text, arranger: arranger.text,
                bars: bars.value, beats: Number(meter[0]), beatType: Number(meter[1]),
                fifths: keys.currentIndex - 7, tempo: tempo.value,
                solo: solo.checked, soloClef: ['treble','tenor','bass'][soloClef.currentIndex],
                soprano: soprano.checked, alto: alto.checked, tenor: tenor.checked,
                baritone: baritone.checked, bass: bass.checked, beatbox: beatbox.checked, rap: rap.checked});
            var fileUrl = Qt.resolvedUrl('Acappella-generated-' + Date.now() + '.musicxml').toString();
            var path = decodeURIComponent(fileUrl.replace(/^file:\/\//, ''));
            if (/^\/[A-Za-z]:/.test(path)) path = path.substring(1);
            outputFile.source = path;
            if (!outputFile.write(xml)) throw new Error('无法写入模板。请将插件文件夹放在 MuseScore 的 Plugins 文件夹中。');
            var score = readScore(path, false);
            if (!score) throw new Error('模板已生成，但 MuseScore 未能打开。可手动打开插件文件夹中的 MusicXML 文件。');
            status.text = '新谱已创建！关闭此窗口后，按 ⌘S / Ctrl+S 保存为 .mscz。';
        } catch (error) { status.text = '创建失败：' + error.message; }
        busy = false;
    }

    ScrollView {
        anchors.fill: parent
        anchors.margins: 20
        clip: true
        ColumnLayout {
            width: 430
            spacing: 10
            Label { text: "阿卡贝拉编曲助手 · Jingwen"; font.pixelSize: 23 }
            Label { text: "v0.1.1 · 一键建谱" }
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
                CheckBox { id: baritone; text: "Baritone" }
                CheckBox { id: bass; text: "Bass"; checked: true }
                CheckBox { id: beatbox; text: "Beatbox · 打击乐谱"; checked: true }
                CheckBox { id: rap; text: "Rap" }
            }
            Button { text: root.busy ? "正在创建…" : "创建新谱"; enabled: !root.busy; Layout.fillWidth: true; onClicked: root.createTemplate() }
            Label { id: status; text: ""; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
}
