# 阿卡贝拉编曲助手 v0.3.1（试用版）

功能：原生一键建谱、按 Workshop 手册检查声部音域、根据和弦符号生成伴唱／Bass 草稿。本版针对 MuseScore Studio 4.7.5，使用其内部 NewScoreModel 原生建谱模型。它不是稳定的公开插件接口，其他版本不能保证兼容；4.7 以下不支持本版。

## 可以做什么

- 默认建立 Solo、Soprano、Alto、Tenor、Baritone、Bass、Beatbox。
- 可勾选 Rap，或取消不需要的声部。
- Solo 可用高音、高音低八度或低音谱号；Tenor 用高音低八度，Baritone/Bass 用低音谱号。
- 设置谱名、编曲者、1–256 小节、调号、4/4／3/4／6/8／2/4 拍号和速度。
- Beatbox 使用打击乐谱；Rap 使用高音谱号。
- 每个声部使用整小节休止符，开始输入音符即可。

## Mac 安装

1. 解压 ZIP，将整个 `acappella-arranger-v0.1` 文件夹放进 MuseScore 的插件目录。通常是 `~/Documents/MuseScore4/Plugins/`，准确路径以 MuseScore「设置／偏好设置 → 文件夹 → 插件」为准。
2. 保持文件夹完整（含 QML、Template.js、NativeInstruments.js、RangeScan.js、CreateFlow.js、ChordEngine.js 和 ChordScore.js），不要只复制 QML 文件。
3. 重启 MuseScore，在首页「插件／Plugins」中找到并启用 **阿卡贝拉编曲助手 · Jingwen**。如果提供重新扫描选项，也可使用它。
4. 从「插件／Plugins」菜单运行插件，选好声部后点击「创建新谱」。
5. 点击创建后，助手自动关闭并打开未保存的新谱；直接输入音符，需要保留时再按 `⌘S` 保存成 `.mscz`。

通过 MuseScore 的原生“从模板创建新谱”流程创建未保存新谱。内部在系统临时目录生成一个 MuseScore 原生 MSCX 模板，但不作为普通文件打开，不显示 MusicXML 文件名，也不调用普通文件导入流程；不自动保存 .mscz。曲名用于新谱标题和首次保存的默认名称。旧版导入产生的最近记录不会自动清除；可用「文件 → 打开最近 → 清除最近文件」手动清除全部记录，实际谱文件不受影响。

原生流程预期不再添加临时导入记录；必须在 MuseScore 4.7.5 实际运行后确认。

默认音色：Solo、Soprano、Alto、Tenor、Baritone、Bass、Rap 为 Piano；Beatbox 保持打击乐。声部名称和各自谱号保留。

## 检查状态与试用

已完成：声部组合、调号、节拍时值、八度谱号、特殊字符转义及参数校验的自动检查；示例 MusicXML 的结构检查。

尚未完成：v0.2.2 在真实 MuseScore 4.7.5／macOS 中运行、播放和关闭未保存新谱后的最近记录验证。本环境没有 MuseScore 桌面程序，所以这是第一版试用包。

请先试一次默认设置，确认：7 个声部、32 小节、4/4、C 调、四分音符 100 BPM，以及 Solo／Tenor／Bass／Beatbox 的谱号和名称。再试 6/8、加入 Baritone 和 Rap。若加载失败，请提供 MuseScore 的完整版本号和错误信息。

## 后续顺序

1. 一键建谱（已有）
2. 声部音域检查（已有）
3. 根据和弦符号生成伴唱／Bass（本版）
4. 伴唱节奏型／使用已有节奏作模板
5. 根据旋律推荐候选和弦，再试听和选择

生成结果均为供听辨、修改的草稿。

## 技术依据

- MuseScore 官方源码，用户版本 revision `3654226`：`src/project/qml/MuseScore/Project/internal/NewScore/newscoremodel.cpp`；本版调用内部 NewScoreModel.createScore，与 MuseScore 原生新谱创建流程相同。`src/engraving/api/v1/score.cpp` 提供音色与声部名称设置。
- 普通插件的 newScore 接口仍未完成新谱打开，因此未使用该接口。
- MusicXML：`https://www.w3.org/2021/06/musicxml40/`
- 插件安装：`https://handbook.musescore.org/customization/plugins`

本版为独立插件文件包，不会更改 Hub 网站。

## GitHub 安装与更新（推荐）

插件源码放在 `jingwen67/acappella-hub` 的 `plugins/acappella-arranger/`，使用 `main` 分支维护。它是独立的桌面插件，不属于 Hub 网页功能。

首次在 Mac 终端运行（需要已安装 Git）：

```bash
mkdir -p "$HOME/Documents/CUCAC-Plugins"
git clone --branch main --single-branch https://github.com/jingwen67/acappella-hub.git "$HOME/Documents/CUCAC-Plugins/acappella-hub"
mkdir -p "$HOME/Documents/MuseScore4/Plugins"
ln -s "$HOME/Documents/CUCAC-Plugins/acappella-hub/plugins/acappella-arranger" "$HOME/Documents/MuseScore4/Plugins/AcappellaArranger"
```

如 MuseScore 的插件目录不同，将最后两行的 `MuseScore4/Plugins` 替换成设置中的实际目录。

若已有 ZIP 安装版，请先把旧的 `acappella-arranger-v0.1` 文件夹移出 Plugins，避免显示两个插件。上面的链接不会覆盖已有的同名文件夹；若 `AcappellaArranger` 已存在，先检查它的来源。

以后更新只需双击仓库插件文件夹中的 `update.command`。它只使用 `git pull --ff-only` 同步这个本地副本，不会自动丢弃本地修改。也可以在终端运行：

```bash
git -C "$HOME/Documents/CUCAC-Plugins/acappella-hub" pull --ff-only
```

更新后关闭插件窗口再重新运行；若 MuseScore 仍加载旧版，重启 MuseScore。新增插件入口时需重新扫描或重启并启用。更新插件代码不需要重新配置上述链接。

若终端提示需要安装命令行开发者工具，先按 macOS 提示安装 Git。`update.command` 因系统设置无法双击执行时，可以右键打开，或直接使用上面的终端命令。


## v0.2.2：多个 Solo 与音域检查

### 多个 Solo

建谱页点击「+ 添加 Solo」，每个 Solo 都可单独选择高音、高音低八度或低音谱号。「−」移除该行。一个 Solo 显示 Solo，多个显示 Solo 1、Solo 2…；未勾选 Solo 时不创建任何 Solo。

### 音域检查

插件顶部切换到「音域检查」。按声部名称识别，并用实际发声音高检查：

| 声部 | 手册舒适音域 |
|---|---|
| Soprano | G3–E5 |
| Alto | D3–B4 |
| Tenor | C3–G4 |
| Baritone | F2–E4 |
| Bass | 下限 D2；手册未提供上限，因此不检查上限 |

包括上下限的音不标红；和弦与装饰音逐颗检查。识别数字后缀和常用缩写；Beatbox、Rap、未知声部默认跳过。Solo 默认不检查；每个 Solo 都有自己的下拉框，可分别选择按哪一种声部检查。选择保存在当前谱子的 jingwenSoloRanges 元数据中，保存谱子后会随文件保留。

打开助手后默认立即检查当前谱，随后约每 0.9 秒检查，不受当前页签影响。真正关闭助手后检查停止。「立即重新检查」仅用于手动刷新，无需先点击。

「清除选区内标记」支持小节范围或选中的音符，按选中的谱表和时间边界清除。「清除全谱标记」清除当前谱的全部本插件标记。清除后暂停自动检查；重新勾选即可恢复检查，仍超音域的音会再次标红。

本插件使用专用红色 #d32f2f，并将原颜色记录在谱子的自定义元数据中。音符回到范围内、或清除时恢复原色。移动／重排已标记音符后，无法对应原位置的标记恢复为黑色。颜色修改可撤销；自动检查开启时可能重新应用检查结果。

已检查：手册边界、Bass 下限、名称别名、多个 Solo 的谱号和名称、原颜色恢复与选区边界。尚需验证：MuseScore 4.7.5 的实际窗口行为、自动标红及选区清除。


## v0.2.2 稳定性调整

移除创建后逐个替换乐器和插入谱号的流程，名称、谱号和音色改为模板中一次定义。创建期间暂停音域检查，每次使用新的原生建谱模型，并在创建期间阻止重复触发。该调整针对已发现的生命周期／并发风险；尚未取得 macOS 崩溃报告，不能断言已经定位或消除全部闪退。

请先测试单个 Solo 的默认谱，再测试多个 Solo。如果仍然闪退，记录发生在点击创建、出现新谱还是播放时，以及声部数量，并提供 macOS 问题报告的异常类型和崩溃线程。


## v0.2.2：先关闭助手，再创建新谱

用户提供的 MuseScore 4.7.5 日志在关闭时记录：`InteractiveProvider::onClose ASSERT FAILED: obj.objectId.isValid()`（interactiveprovider.cpp:828）。它表明窗口关闭时未找到对应的窗口记录；日志没有崩溃线程，不能据此确认记录丢失的全部原因。

本次调整只在助手正常关闭、窗口不可见后，才同步调用原生建谱模型。关闭失败则取消建谱；不在关闭中的窗口上启动延时任务。点「创建新谱」会自动关闭助手，再打开未保存的新谱，无需提前保存。音域检查仍从同一个插件入口打开，手动关闭不会建谱。

依据 revision `3654226`：PluginAPI.quit 的关闭通知；ExtensionViewerDialog 的关闭处理；InteractiveProvider.qml 的 closed 回调先注销窗口，再调用延迟销毁；WindowView.close 处理窗口隐藏。代码依赖内部实现，仍需在用户的 macOS 4.7.5 验证；本环境只能检查关闭／创建的调用顺序，不能验证实际桌面窗口是否正常关闭。新增阶段日志以便区分关闭与创建失败。


## v0.2.3：保留声部谱号和 Piano

建谱模板改用原生 MSCX。MusicXML 的小节谱号在模板小节重建时不能作为持久默认值保证保留；原生模板明确填写谱表 defaultClef 和 Instrument clef，并用 Piano 的 instrumentId／Channel program 保存音色。每个声部只建立一个谱表。

- Solo：逐个按选择的高音、高音低八度、低音谱号；多个 Solo 的名称为 Solo 1、Solo 2…。
- Soprano／Alto／Rap：高音谱号。
- Tenor：高音低八度。
- Baritone／Bass：低音谱号；Baritone 默认勾选。
- 除 Beatbox 外全部使用 Piano；Beatbox 使用完整 Drum Kit 定义及打击乐谱号。

原生乐器数据改编自 MuseScore revision `3654226` 的 Piano 和 Rock Band 模板，来源见 NativeInstruments.js（GPL-3.0-only）。沿用已由用户确认不闪退的“先关闭助手，再创建新谱”顺序；仍只创建未保存新谱。

已检查默认 7 声部、3 个不同谱号的 Solo 加 Rap、单谱表、声部名称、持久谱号、Piano 的 program=0 和打击乐映射。没有实际桌面 MuseScore；新模板的显示和回放仍需在 Mac 验证。


## v0.2.4：独立 Solo 音域、默认自动检查、悬浮入口

- 按当前谱子的每个 Solo 分别显示音域下拉框，设置保存于当前谱子的自定义元数据。新谱没有设置时默认“不检查”，需为每个 Solo 选一次；其余声部仍按名称和手册默认规则检查。
- 打开助手即开始检查，建谱页、音域页和收起状态下均自动检查。清除标记仍会暂停自动检查，防止立即重新标红。
- 点击右上「收起」变为 76×76 音符小窗，点击音符展开。沿用同一个 MuseScore 窗口和关闭流程，保留标题栏及系统关闭按钮；不是无边框桌面图标。关闭后自动检查停止。
- 用户已确认 v0.2.3 的两个功能可用。本次未修改建谱函数的行为，保留各声部谱号、Piano 和先关闭再创建。

已检查：两个 Solo 的独立边界、普通声部规则、设置保存和重新读取、切换谱子的设置隔离、首次立即检查、默认页签及收起状态下的计时器，以及建谱流程没有改变。原生小窗缩放尚需 macOS 4.7.5 验证。


## v0.2.5：取消悬浮小窗

按用户要求移除音符小窗和「收起」按钮，恢复固定大小的普通助手窗口。每个 Solo 的独立音域选择、随谱子保存的设置以及默认自动检查保持不变。自动检查在助手打开时运行，不受页签影响；关闭助手后停止。


## v0.3.0：和弦生成（第一步）

1. 在谱面选中音符或休止符，按 `⌘K / Ctrl+K` 输入和弦符号（普通文字不是和弦符号）。例如四小节各写 C、Am、F、G7。
2. 在谱面选择连续小节范围（蓝色框），打开助手的「和弦生成」页。
3. 选择和弦来源谱表；自动模式取首个有和弦符号的谱表。默认勾选识别出的 Soprano／Alto／Tenor／Baritone／Bass，可取消不需要的声部。
4. 点「生成和弦伴唱」，关闭助手试听；按 `⌘Z / Ctrl+Z` 可撤销本次生成。

功能规则：

- 读取当前选区时间范围；选区开始前最后一个和弦可以延续进选区。第一处和弦之前保持休止，N.C. 区间保持休止。
- 各目标声部写一条长音线，按手册音域、相邻和弦的小幅移动及生成声部之间不交叉分配。优先保留三音／sus 音和七音。Bass 使用根音，斜杠和弦使用指定低音；手册未设置 Bass 上限，生成时优先较低音区。
- 只填目标声部第一音轨的休止符；Solo／Rap／Beatbox 跳过。任何音轨已有音符时，跳过与之重叠的第一音轨休止符，不覆盖已有音符。
- 使用选区的时间范围，以及界面勾选的目标谱表；不要求目标谱表也在原来的蓝色选框内。选区开头落在休止符中间时，该休止符会跳过，请尽量选择完整小节。
- 和弦持续至下一处和弦；跨小节的有效长时值由 MuseScore 原生写入流程拆分、连接延音线。不能用单一时值表达的片段会拆为多段，可能重新起音，供后续节奏调整。
- 支持大／小三和弦、属七、maj7／M7／△、m7、dim、dim7、m7b5／ø、aug、sus2／sus4、7sus4、6／m6、升降根音和斜杠低音。暂不支持扩展／变音九和弦、罗马数字、数字低音、任意普通文本。
- 不认识的和弦先报错，不开始写谱。连音休止符跳过；不支持的时值报错。一个生成动作放在一个撤销事务中，写入校验失败则回滚。

验证：`node plugins/acappella-arranger/tests/chords.test.cjs`，仅使用 Node 内置模块。覆盖 196 种和弦拼写／配音、时值、斜杠低音、跨小节延音链、无和弦与 N.C. 空白、选区边界、各音轨已有音符保护、连音跳过、重复生成、未知符号、单个撤销事务和注入失败后的回滚。分配逻辑和模拟 API 测试已通过；本环境没有桌面 MuseScore，实际 macOS 4.7.5 写谱、播放和撤销仍需试用。

原有建谱函数、Piano／谱号及音域规则保持不变。此更新仅上传 main 的独立桌面插件，不触发 Hub 的 Vercel 部署。


## v0.3.1：识别小写根音

修复 MuseScore 的和弦文本返回 am、c 等小写根音时解析失败。根音及斜杠低音兼容大小写，只规范音名，不改变后缀，因此 cM7 仍是大七、cm7 仍是小七。新增小写根音、斜杠低音和 M7／m7 区分的回归检查。
