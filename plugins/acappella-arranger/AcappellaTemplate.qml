import QtQuick 2.15
import QtQuick.Window 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import FileIO 3.0
import "Template.js" as Template
import "RangeScan.js" as RangeScan
import "CreateFlow.js" as CreateFlow
import "BassHarmony.js" as BassHarmony
import "BassScore.js" as BassScore

MuseScore {
    id: root
    title: "阿卡贝拉编曲助手 · Jingwen"
    description: "Create a cappella scores, check vocal ranges and voice chords from an existing bass line."
    version: "0.7.0"
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
        root.refreshBassSources();
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
                createInfo, function(stage) { console.log('[Jingwen 0.7.0] ' + stage); });
            // Do not access the closing UI or schedule work after this call.
        } catch(error) {
            console.error('[Jingwen 0.7.0] 创建失败：' + error.message);
            if (root.Window.window && root.Window.window.visible) {
                status.text='创建失败：'+error.message;
                busy=false;
            } else {
                creationError.text=error.message;
                creationError.open();
            }
        }
    }

    TabBar { id: featureTabs; anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right; anchors.margins: 12; TabButton { text: "建谱" } TabButton { text: "音域检查" } TabButton { text: "Bass 配和弦" } }

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
            Label { text: "v0.7.0 · 一键建谱" }
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
        onTriggered: { root.syncSoloRanges(); if(autoRange.checked)root.runRange('check'); }
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



    property var bassSources: []
    property var bassSlots: []
    property string bassSnapshot: ''
    ListModel { id:bassRows }
    function refreshBassSources() {
        var rows=[];
        if(curScore)for(var i=0;i<curScore.nstaves;i++)rows.push((i+1)+'. '+String(curScore.staves[i].part.longName || curScore.staves[i].part.partName).replace(/<[^>]*>/g,''));
        if(JSON.stringify(rows)!==JSON.stringify(bassSources))bassSources=rows;
    }
    function bassRead() {
        if(!curScore)throw new Error('请先打开谱子并写好 Bass。');
        return BassScore.read(curScore,{chord:Element.CHORD,rest:Element.REST,harmony:Element.HARMONY},
            bassSource.currentIndex-1,soloSource.currentIndex===0?-1:soloSource.currentIndex===1?-2:soloSource.currentIndex-2,
            division,function(tick){return root.fractionFromTicks(tick);});
    }
    function analyzeBass() {
        if(busy || rangeBusy)return;
        busy=true;
        try {
            refreshBassSources();
            var data=bassRead(),slots=BassHarmony.analyze(data,bassMode.currentIndex===1,division);
            bassRows.clear();
            for(var i=0;i<slots.length;i++) {
                var names=slots[i].choices.map(function(c){return c.label+(c.melodyConflict?'（旋律需核对）':'');});
                bassRows.append({caption:'第 '+slots[i].measure+' 小节 · 拍位 '+slots[i].position,choices:JSON.stringify(names),choiceIndex:0});
            }
            bassSlots=slots;bassSnapshot=data.snapshot;
            bassStatus.text='已列出 '+slots.length+' 个和弦位置。低音不能唯一确定和弦，请确认候选；有 Solo 时会参考长音与分段起始音。';
        } catch(error){bassRows.clear();bassSlots=[];bassStatus.text=error.message;}
        finally{busy=false;}
    }
    function generateBassHarmony() {
        if(busy || rangeBusy)return;
        busy=true;
        try {
            var data=bassRead();
            if(data.snapshot!==bassSnapshot)throw new Error('Bass、Solo 或选区已改变，请重新分析。');
            var chosen=[];for(var i=0;i<bassRows.count;i++)chosen.push(bassRows.get(i).choiceIndex);
            var result=BassScore.generate(curScore,data,bassSlots,chosen,
                {chord:Element.CHORD,rest:Element.REST,chordRest:Segment.ChordRest,harmony:Element.HARMONY},
                division,function(tick){return root.fractionFromTicks(tick);},function(type){return root.newElement(type);});
            bassStatus.text='已写入 '+result.written+' 段伴唱，跳过 '+result.protectedCount+' 个有内容的位置。关闭助手播放试听；⌘Z 撤销后可更换候选。';
        } catch(error){bassStatus.text='未完成：'+error.message;}
        finally{busy=false;}
    }
    ScrollView {
        visible:featureTabs.currentIndex===2
        anchors.top:featureTabs.bottom;anchors.left:parent.left;anchors.right:parent.right;anchors.bottom:parent.bottom
        anchors.margins:20;clip:true
        ColumnLayout {
            width:430;spacing:12
            Label { text:'根据 Bass 配和弦';font.pixelSize:22 }
            Label { text:'先写 Bass，再分析候选、确认和弦并生成长音伴唱。4/4 的第一、第三拍和 6/8 的两个大拍都会检查；Bass 与 Solo 音符保留。';Layout.fillWidth:true;wrapMode:Text.Wrap }
            Label { text:'没有范围选区时处理全谱；已有伴唱音符不会被覆盖。' ;Layout.fillWidth:true;wrapMode:Text.Wrap }
            Label { text:'低音来源' }
            ComboBox { id:bassSource;model:['自动（Bass）'].concat(root.bassSources);Layout.fillWidth:true;enabled:!root.busy }
            Label { text:'旋律参考（第一音轨）' }
            ComboBox { id:soloSource;model:['自动（首个 Solo）','不使用 Solo'].concat(root.bassSources);Layout.fillWidth:true;enabled:!root.busy }
            ComboBox { id:bassMode;model:['按调号的大调','按调号的小调'];Layout.fillWidth:true;enabled:!root.busy;onActivated:{bassRows.clear();root.bassSlots=[];} }
            Button { text:'分析 Bass 与候选和弦';Layout.fillWidth:true;enabled:!root.busy && !root.rangeBusy;onClicked:root.analyzeBass() }
            Repeater {
                model:bassRows
                ColumnLayout {
                    id:bassRow
                    property int rowNumber:index
                    Layout.fillWidth:true
                    Label { text:caption }
                    ComboBox { model:JSON.parse(choices);currentIndex:choiceIndex;Layout.fillWidth:true;enabled:!root.busy;onActivated:bassRows.setProperty(bassRow.rowNumber,'choiceIndex',currentIndex) }
                }
            }
            Button { text:'按所选和弦生成伴唱';Layout.fillWidth:true;enabled:bassRows.count>0 && !root.busy && !root.rangeBusy;onClicked:root.generateBassHarmony() }
            Label { id:bassStatus;text:'仅支持基础三和弦、属七和弦与转位。候选不是唯一答案；不确定时先试听。';Layout.fillWidth:true;wrapMode:Text.Wrap }
        }
    }
}

