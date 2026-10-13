import QtQuick 2.15
import QtQuick.Window 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import FileIO 3.0
import "Template.js" as Template
import "RangeScan.js" as RangeScan
import "CreateFlow.js" as CreateFlow
import "ChordEngine.js" as ChordEngine
import "ChordScore.js" as ChordScore

MuseScore {
    id: root
    title: "阿卡贝拉编曲助手 · Jingwen"
    description: "Create an a cappella score with selected voices, key, meter and tempo."
    version: "0.3.2"
    menuPath: "Plugins.Acappella Arranger - Jingwen"
    pluginType: "dialog"
    requiresScore: false
    width: 480
    height: 780
    property bool busy: false
    property var nativeModel: null
    FileIO { id: templateFile }
    MessageDialog { id: creationError; title: "未能创建新谱"; standardButtons: [StandardButton.Ok] }
    onRun: {
        status.text = "选择声部后创建新谱。";
        root.syncSoloRanges();
        root.syncChordTargets();
        if (curScore) root.runRange('check');
    }

    function createTemplate() {
        if (busy || rangeBusy) return;
        busy = true;
        try {
            if (mscoreMajorVersion !== 4 || mscoreMinorVersion < 7)
                throw new Error('原生建谱试用版需要 MuseScore Studio 4.7.x。');
            var meter = meters.currentText.split('/');
            var options = {title:scoreTitle.text.trim() || 'A Cappella',arranger:arranger.text,
                bars:bars.value,beats:Number(meter[0]),beatType:Number(meter[1]),
                fifths:keys.currentIndex-7,tempo:tempo.value,
                solos:solo.checked ? soloSettings() : [],
                soprano:soprano.checked,alto:alto.checked,tenor:tenor.checked,
                baritone:baritone.checked,bass:bass.checked,beatbox:beatbox.checked,rap:rap.checked};
            // A native template supplies persistent staff defaults and piano instruments.
            // MuseScore's native template workflow creates the requested measures.
            Template.build(options);
            var templateOptions={};
            for(var key in options)templateOptions[key]=options[key];
            templateOptions.bars=1;
            var xml=Template.buildNative(templateOptions);
            var folder=templateFile.tempPath().replace(/\\/g,'/').replace(/\/$/,'');
            var path=folder+'/Jingwen-template-'+Date.now()+'.mscx';
            templateFile.source=path;
            if(templateFile.exists())throw new Error('临时模板重名，请稍后重试。');
            if(!templateFile.write(xml))throw new Error('无法写入临时模板。');
            // Do not cache a model tied to an earlier score context.
            if(nativeModel){nativeModel.destroy();nativeModel=null;}
            nativeModel=Qt.createQmlObject(
                'import QtQuick; import MuseScore.Project; NewScoreModel {}',
                root,'JingwenNativeScoreModel');
            var createInfo={
                title:options.title,subtitle:'',
                composer:options.arranger.trim() ? 'Arranged by '+options.arranger.trim() : '',
                lyricist:'',copyright:'',templatePath:path,instruments:[],
                scoreOrder:{id:'custom',customized:true},measureCount:options.bars,
                timeSignatureType:0,timeSignature:{numerator:options.beats,denominator:options.beatType},
                keySignature:{key:options.fifths},withPickupMeasure:false,
                pickupTimeSignature:{numerator:1,denominator:4},
                withTempo:true,tempo:{value:options.tempo,noteIcon:0,withDot:false}
            };
            // quit() closes the host synchronously; QML destroy() is deferred
            // until this script returns. Capture the window and model first.
            var assistantWindow = root.Window.window;
            var model = nativeModel;
            status.text = '正在关闭助手并创建新谱…';
            CreateFlow.run(assistantWindow,
                function() { root.quit(); },
                function(info) { return model.createScore(info); },
                createInfo, function(stage) { console.log('[Jingwen 0.3.2] ' + stage); });
            // Do not access the closing UI or schedule work after this call.
        } catch(error) {
            console.error('[Jingwen 0.3.2] 创建失败：' + error.message);
            if (root.Window.window && root.Window.window.visible) {
                status.text='创建失败：'+error.message;
                busy=false;
            } else {
                creationError.text=error.message;
                creationError.open();
            }
        }
    }

    TabBar { id: featureTabs; anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right; anchors.margins: 12; TabButton { text: "建谱" } TabButton { text: "音域检查" } TabButton { text: "和弦生成" } onCurrentIndexChanged: { if(currentIndex===2)root.syncChordTargets(); } }

    ScrollView {
        visible: featureTabs.currentIndex === 0
        anchors.top: featureTabs.bottom
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: 20
        clip: true
        ColumnLayout {
            width: 430
            spacing: 10
            Label { text: "阿卡贝拉编曲助手 · Jingwen"; font.pixelSize: 23 }
            Label { text: "v0.3.2 · 一键建谱" }
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
            CheckBox { id: solo; text: "Solo"; checked: true }
            Repeater {
                model: soloList
                RowLayout {
                    visible: solo.checked
                    Label { text: soloList.count === 1 ? "Solo" : "Solo " + (index+1) }
                    ComboBox { model: ['高音谱号','高音谱号 ↓8','低音谱号']; currentIndex: clefIndex; Layout.fillWidth: true; onActivated: soloList.setProperty(index, "clefIndex", currentIndex) }
                    Button { text: "−"; enabled: soloList.count > 1; onClicked: soloList.remove(index) }
                }
            }
            Button { text: "+ 添加 Solo"; visible: solo.checked; onClicked: soloList.append({clefIndex:0}) }
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
    ListModel { id: soloList; ListElement { clefIndex: 0 } }
    property bool rangeBusy: false
    function soloSettings() {
        var result=[];
        for(var i=0;i<soloList.count;i++)result.push({clef:['treble','tenor','bass'][soloList.get(i).clefIndex]});
        return result;
    }
    ListModel { id: soloRanges }
    property var rangeProfiles: ['off','soprano','alto','tenor','baritone','bass']
    function readSoloProfiles(score) {
        try { var saved=JSON.parse(score.metaTag('jingwenSoloRanges') || '{}'); return saved && typeof saved==='object' ? saved : {}; }
        catch(error) { return {}; }
    }
    function syncSoloRanges() {
        var score=curScore;
        var rows=score ? RangeScan.soloEntries(score) : [];
        var saved=score ? readSoloProfiles(score) : {};
        var changed=rows.length!==soloRanges.count;
        for(var i=0;i<rows.length;i++) {
            rows[i].profileIndex=Math.max(0,rangeProfiles.indexOf(saved[rows[i].key] || 'off'));
            if(!changed) {
                var previous=soloRanges.get(i);
                if(previous.key!==rows[i].key || previous.label!==rows[i].label ||
                    previous.staff!==rows[i].staff || previous.profileIndex!==rows[i].profileIndex)changed=true;
            }
        }
        if(changed) {
            soloRanges.clear();
            for(var n=0;n<rows.length;n++)soloRanges.append(rows[n]);
        }
    }
    function setSoloRange(key,index) {
        if(busy || rangeBusy || !curScore)return;
        var score=curScore;
        var saved=readSoloProfiles(score);
        saved[key]=rangeProfiles[index];
        score.startCmd('Jingwen Solo range');
        score.setMetaTag('jingwenSoloRanges',JSON.stringify(saved));
        score.endCmd();
        syncSoloRanges();
        if(autoRange.checked)runRange('check');
    }
    function runRange(mode) {
        if(rangeBusy || busy)return;
        var score=curScore;
        if(!score){rangeStatus.text='请先打开一份谱。';return;}
        if(mode==='clear' && !score.selection.isRange && score.selection.elements.length===0) {
            rangeStatus.text='请先在谱面选择要清除标记的音符或小节范围。';return;
        }
        rangeBusy=true;
        var started=false;
        try {
            var saved={};
            try { saved=JSON.parse(score.metaTag('jingwenRangeMarks') || '{}'); }catch(error){}
            syncSoloRanges();
            var profilesByStaff={};
            for(var p=0;p<soloRanges.count;p++) {
                var soloRow=soloRanges.get(p);
                profilesByStaff[soloRow.staff]=rangeProfiles[soloRow.profileIndex];
            }
            var items=RangeScan.notes(score,Element.CHORD,function(name,staff){return profilesByStaff[staff] || 'off';});
            var result=RangeScan.plan(items,saved,mode,function(item){return RangeScan.selectionContains(score,item);});
            var metadata=JSON.stringify(result.marks);
            if(result.edits.length || metadata!==JSON.stringify(saved)) {
                score.startCmd('Jingwen range check');
                started=true;
                for(var i=0;i<result.edits.length;i++)result.edits[i].note.color=result.edits[i].color;
                score.setMetaTag('jingwenRangeMarks',metadata);
                score.endCmd();
                started=false;
            }
            if(mode==='clear' || mode==='clearAll') {
                autoRange.checked=false;
                rangeStatus.text='已清除 '+result.edits.length+' 个标记；自动检查已暂停，避免立即重新标红。';
            } else rangeStatus.text='检查完成：'+result.count+' 个音符超出手册音域。';
        } catch(error) {
            if(started)score.endCmd(true);
            rangeStatus.text='音域检查失败：'+error.message;
        }
        rangeBusy=false;
    }
    Timer {
        interval: 900;repeat:true
        running: !root.busy && !root.rangeBusy
        onTriggered: { root.syncSoloRanges(); if(featureTabs.currentIndex===2)root.syncChordTargets(); if(autoRange.checked)root.runRange('check'); }
    }
    ScrollView {
        visible: featureTabs.currentIndex===1
        anchors.top:featureTabs.bottom;anchors.left:parent.left;anchors.right:parent.right;anchors.bottom:parent.bottom
        anchors.margins:20;clip:true
        ColumnLayout {
            width:430;spacing:12
            Label { text:'音域检查 · 按 Workshop 手册';font.pixelSize:20 }
            Label { text:'Soprano  G3–E5\nAlto  D3–B4\nTenor  C3–G4\nBaritone  F2–E4\nBass  下限 D2，上限未设置';Layout.fillWidth:true;wrapMode:Text.Wrap }
            Label { text:'按实际发声音高检查；Beatbox、Rap 和未识别的名称默认跳过。';Layout.fillWidth:true;wrapMode:Text.Wrap }
            Label { text:'每个 Solo 单独选择音域'; visible:soloRanges.count>0; font.bold:true }
            Repeater {
                model:soloRanges
                RowLayout {
                    Label { text:label; Layout.preferredWidth:110 }
                    ComboBox {
                        model:['不检查','Soprano','Alto','Tenor','Baritone','Bass']
                        currentIndex:profileIndex; Layout.fillWidth:true
                        enabled:!root.busy && !root.rangeBusy
                        onActivated:root.setSoloRange(key,currentIndex)
                    }
                }
            }
            CheckBox { id:autoRange;text:'自动检查（保持助手打开）';checked:true }
            Button { text:'立即重新检查';Layout.fillWidth:true;onClicked:root.runRange('check') }
            Button { text:'清除选区内标记';Layout.fillWidth:true;onClicked:root.runRange('clear') }
            Button { text:'清除全谱标记';Layout.fillWidth:true;onClicked:root.runRange('clearAll') }
            Label { text:'清除前先在谱面选择音符或小节范围。清除后会暂停自动检查，可重新勾选开启。';Layout.fillWidth:true;wrapMode:Text.Wrap;font.pixelSize:12 }
            Label { id:rangeStatus;text:'助手打开后自动检查，无需点击检查按钮。';Layout.fillWidth:true;wrapMode:Text.Wrap }
        }
    }


    ListModel { id: chordTargets }
    property var chordSources: ['自动（首个有和弦的谱表）']
    function syncChordTargets() {
        var score=curScore;
        var rows=score?ChordScore.targets(score):[];
        var changed=rows.length!==chordTargets.count;
        var chosen={};
        for(var p=0;p<chordTargets.count;p++) {
            var previous=chordTargets.get(p);
            chosen[previous.staff+':'+previous.name]=previous.selected;
            if(!changed && (previous.staff!==rows[p].staff || previous.name!==rows[p].name || previous.profile!==rows[p].profile))changed=true;
        }
        if(changed) {
            chordTargets.clear();
            for(var i=0;i<rows.length;i++) {
                var key=rows[i].staff+':'+rows[i].name;
                if(Object.prototype.hasOwnProperty.call(chosen,key))rows[i].selected=chosen[key];
                chordTargets.append(rows[i]);
            }
        }
        var sources=['自动（首个有和弦的谱表）'];
        if(score)for(var s=0;s<score.nstaves;s++) {
            var part=score.staves[s].part;
            sources.push((s+1)+'. '+ChordEngine.plain(part.longName || part.partName || '谱表'));
        }
        if(JSON.stringify(sources)!==JSON.stringify(chordSources)) {
            chordSources=sources;
            sourceStaff.currentIndex=0;
        }
    }
    function generateChords() {
        if(busy || rangeBusy)return;
        var score=curScore;
        if(!score){chordStatus.text='请先打开一份谱。';return;}
        busy=true;
        var started=false;
        try {
            syncChordTargets();
            var targets=[];
            for(var i=0;i<chordTargets.count;i++) {
                var target=chordTargets.get(i);
                if(target.selected)targets.push({staff:target.staff,name:target.name,profile:target.profile});
            }
            var enums={all:Segment.All,chordRest:Segment.ChordRest,harmony:Element.HARMONY,chord:Element.CHORD,rest:Element.REST};
            var data=ChordScore.read(score,enums,sourceStaff.currentIndex-1,targets);
            data.mode=['absolute','degree','transpose'][chordMode.currentIndex];
            if(data.mode!=='absolute') {
                var fifths=score.staves[data.source].key(root.fractionFromTicks(data.start));
                data.key=ChordEngine.keyInfo(fifths,tonality.currentIndex===1);
            }
            var plan=ChordEngine.plan(data,targets,division);
            if(!plan.notes.length) {
                chordStatus.text='没有可填的休止符；已有音符、连音休止符及 N.C. 区间都会跳过。';
                return;
            }
            console.log('[Jingwen chords] writing '+plan.notes.length+' long-note sections');
            score.startCmd('Jingwen chord accompaniment');
            started=true;
            ChordScore.write(score,plan,enums,function(tick){return root.fractionFromTicks(tick);},division);
            score.selection.selectRange(data.start,data.end,data.startStaff,data.endStaff);
            score.endCmd();
            started=false;
            var source=score.staves[data.source].part;
            chordStatus.text='已生成 '+plan.restCount+' 段长音伴唱，和弦：'+plan.labels.join(' → ')+
                '\n来源：'+ChordEngine.plain(source.longName || source.partName)+
                '。已有音符保留；可按 ⌘Z / Ctrl+Z 撤销。';
            console.log('[Jingwen chords] completed');
        } catch(error) {
            if(started)score.endCmd(true);
            console.error('[Jingwen chords] '+error.message);
            chordStatus.text='生成失败：'+error.message;
        } finally {
            busy=false;
        }
    }
    ScrollView {
        visible:featureTabs.currentIndex===2
        anchors.top:featureTabs.bottom;anchors.left:parent.left;anchors.right:parent.right;anchors.bottom:parent.bottom
        anchors.margins:20;clip:true
        ColumnLayout {
            width:430;spacing:12
            Label { text:'和弦生成 · 长音伴唱';font.pixelSize:20 }
            Label {
                text:'先用 ⌘K / Ctrl+K 输入和弦，再在谱面选取连续小节范围。选择来源和目标声部后生成。'
                Layout.fillWidth:true;wrapMode:Text.Wrap
            }
            Label { text:'生成方式';font.bold:true }
            ComboBox { id:chordMode;model:['实际字母和弦','当前调的级数（1／I）','C 调参考和弦整体移调'];Layout.fillWidth:true;enabled:!root.busy }
            ComboBox { id:tonality;visible:chordMode.currentIndex!==0;model:['当前调按大调','当前调按小调'];Layout.fillWidth:true;enabled:!root.busy }
            Label { visible:chordMode.currentIndex!==0;text:'调号取和弦来源谱表选区开始处。级数模式：1、6、4、5⁷；C 调参考模式：C、Am、F、G7。小调的五级默认用大三和弦／属七。整体移调保留原和弦的大小性质。';Layout.fillWidth:true;wrapMode:Text.Wrap;font.pixelSize:12 }
            Label { text:'和弦来源';font.bold:true }
            ComboBox { id:sourceStaff;model:root.chordSources;Layout.fillWidth:true;enabled:!root.busy }
            Label { text:'目标声部';font.bold:true }
            Repeater {
                model:chordTargets
                CheckBox {
                    text:name;checked:selected;enabled:!root.busy
                    onClicked:chordTargets.setProperty(index,'selected',checked)
                }
            }
            Label {
                visible:chordTargets.count===0
                text:'按声部名识别 Soprano、Alto、Tenor、Baritone、Bass（及常用缩写）。Solo、Rap、Beatbox 不参与。'
                Layout.fillWidth:true;wrapMode:Text.Wrap
            }
            Label {
                text:'按手册音域分配，每个声部一条线；尽量小幅移动、不交叉。Bass 唱根音，C/E 等斜杠和弦唱指定低音。'
                Layout.fillWidth:true;wrapMode:Text.Wrap
            }
            Label {
                text:'只填第一音轨的休止符，已有音符保留；其他音轨有音符时也跳过对应休止符。选区的谱表范围不限制这里勾选的目标，只使用选区的时间范围。'
                Layout.fillWidth:true;wrapMode:Text.Wrap;font.pixelSize:12
            }
            Label {
                text:'支持：C、Cm、G7、Cmaj7、Am7、dim、dim7、m7b5、aug、sus2、sus4、7sus4、6、m6、斜杠和弦。N.C. 留空；本版跳过连音休止符。'
                Layout.fillWidth:true;wrapMode:Text.Wrap;font.pixelSize:12
            }
            Button {
                text:root.busy?'正在生成…':'生成和弦伴唱';Layout.fillWidth:true
                enabled:!root.busy && !root.rangeBusy && chordTargets.count>0
                onClicked:root.generateChords()
            }
            Label { id:chordStatus;text:'生成的是伴唱草稿，可试听后修改。';Layout.fillWidth:true;wrapMode:Text.Wrap }
        }
    }

}
