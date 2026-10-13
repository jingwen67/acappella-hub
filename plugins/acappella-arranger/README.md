# 阿卡贝拉编曲助手 v0.2.1（试用版）

功能：原生一键建谱＋按 Workshop 手册检查声部音域。本版针对 MuseScore Studio 4.7.5，使用其内部 NewScoreModel 原生建谱模型。它不是稳定的公开插件接口，其他版本不能保证兼容；4.7 以下不支持本版。

## 可以做什么

- 默认建立 Solo、Soprano、Alto、Tenor、Baritone、Bass、Beatbox。
- 可勾选 Rap，或取消不需要的声部。
- Solo 可用高音、高音低八度或低音谱号；Tenor 用高音低八度，Baritone/Bass 用低音谱号。
- 设置谱名、编曲者、1–256 小节、调号、4/4／3/4／6/8／2/4 拍号和速度。
- Beatbox 使用打击乐谱；Rap 使用高音谱号。
- 每个声部使用整小节休止符，开始输入音符即可。

## Mac 安装

1. 解压 ZIP，将整个 `acappella-arranger-v0.1` 文件夹放进 MuseScore 的插件目录。通常是 `~/Documents/MuseScore4/Plugins/`，准确路径以 MuseScore「设置／偏好设置 → 文件夹 → 插件」为准。
2. 保持 `AcappellaTemplate.qml` 和 `Template.js` 在同一文件夹，不要只复制 QML 文件。
3. 重启 MuseScore，在首页「插件／Plugins」中找到并启用 **阿卡贝拉编曲助手 · Jingwen**。如果提供重新扫描选项，也可使用它。
4. 从「插件／Plugins」菜单运行插件，选好声部后点击「创建新谱」。
5. 关闭插件窗口，在新谱中按 `⌘S` 保存成 `.mscz`。

通过 MuseScore 的原生“从模板创建新谱”流程创建未保存新谱。内部在系统临时目录生成一个 MusicXML 模板，但不作为普通文件打开，不显示 MusicXML 文件名，也不调用普通文件导入流程；不自动保存 .mscz。曲名用于新谱标题和首次保存的默认名称。旧版导入产生的最近记录不会自动清除；可用「文件 → 打开最近 → 清除最近文件」手动清除全部记录，实际谱文件不受影响。

原生流程预期不再添加临时导入记录；必须在 MuseScore 4.7.5 实际运行后确认。

默认音色：Solo、Soprano、Alto、Tenor、Baritone、Bass、Rap 为 Piano；Beatbox 保持打击乐。声部名称和各自谱号保留。

## 检查状态与试用

已完成：声部组合、调号、节拍时值、八度谱号、特殊字符转义及参数校验的自动检查；示例 MusicXML 的结构检查。

尚未完成：v0.2.1 在真实 MuseScore 4.7.5／macOS 中运行、播放和关闭未保存新谱后的最近记录验证。本环境没有 MuseScore 桌面程序，所以这是第一版试用包。

请先试一次默认设置，确认：7 个声部、32 小节、4/4、C 调、四分音符 100 BPM，以及 Solo／Tenor／Bass／Beatbox 的谱号和名称。再试 6/8、加入 Baritone 和 Rap。若加载失败，请提供 MuseScore 的完整版本号和错误信息。

## 后续顺序

1. 一键建谱（本版）
2. 同词同节奏复制到指定声部
3. 根据调号生成三度和声草稿
4. 声部音域检查
5. 根据填写的和弦符号生成和声／Bass 草稿

后续和声输出均为供听辨、修改的草稿。

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


## v0.2.1：多个 Solo 与音域检查

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

包括上下限的音不标红；和弦与装饰音逐颗检查。识别数字后缀和常用缩写；Beatbox、Rap、未知声部默认跳过。Solo 默认不检查，可在下拉框选择按哪一种声部检查，应用于所有 Solo。

保持插件窗口打开并停留在音域检查页时，会约每 0.9 秒重新检查。关闭窗口后自动检查停止；也可用「检查全谱」手动检查。实际窗口与主谱面交互仍需要在 Mac 上确认。

「清除选区内标记」支持小节范围或选中的音符，按选中的谱表和时间边界清除。「清除全谱标记」清除当前谱的全部本插件标记。清除后暂停自动检查；重新勾选即可恢复检查，仍超音域的音会再次标红。

本插件使用专用红色 #d32f2f，并将原颜色记录在谱子的自定义元数据中。音符回到范围内、或清除时恢复原色。移动／重排已标记音符后，无法对应原位置的标记恢复为黑色。颜色修改可撤销；自动检查开启时可能重新应用检查结果。

已检查：手册边界、Bass 下限、名称别名、多个 Solo 的谱号和名称、原颜色恢复与选区边界。尚需验证：MuseScore 4.7.5 的实际窗口行为、自动标红及选区清除。


## v0.2.1 稳定性调整

移除创建后逐个替换乐器和插入谱号的流程，名称、谱号和音色改为模板中一次定义。创建期间暂停音域检查，每次使用新的原生建谱模型，并设置 1.5 秒冷却防止重复触发。该调整针对已发现的生命周期／并发风险；尚未取得 macOS 崩溃报告，不能断言已经定位或消除全部闪退。

请先测试单个 Solo 的默认谱，再测试多个 Solo。如果仍然闪退，记录发生在点击创建、出现新谱还是播放时，以及声部数量，并提供 macOS 问题报告的异常类型和崩溃线程。
