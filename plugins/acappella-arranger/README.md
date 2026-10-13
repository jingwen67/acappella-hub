# 阿卡贝拉编曲助手 v0.1.3（试用版）

第一项功能：一键建立阿卡贝拉新谱。面向 MuseScore Studio 4.4 及以上的 4.x 版本；5.x 尚未验证。

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
3. 重启 MuseScore，在首页「插件／Plugins」中找到并启用 **阿卡贝拉编曲助手 · 建谱**。如果提供重新扫描选项，也可使用它。
4. 从「插件／Plugins」菜单运行插件，选好声部后点击「创建新谱」。
5. 关闭插件窗口，在新谱中按 `⌘S` 保存成 `.mscz`。

插件在系统临时目录以曲名生成 MusicXML 并在新标签页打开，首次保存时默认使用该文件名。无法用于文件名的字符会替换成下划线；遇到同名临时文件时追加编号，避免覆盖。不会立即删除导入文件，以免 MuseScore 异步读取失败；不会自动保存 .mscz 或替换已有的谱。临时文件和最近打开记录可能保留。

默认音色：Solo、Soprano、Alto、Tenor、Baritone、Bass、Rap 为 Piano；Beatbox 保持打击乐。声部名称和各自谱号保留。

## 检查状态与试用

已完成：声部组合、调号、节拍时值、八度谱号、特殊字符转义及参数校验的自动检查；示例 MusicXML 的结构检查。

尚未完成：在真实 MuseScore 4／macOS 中加载插件和试听的验证。本环境没有 MuseScore 桌面程序，所以这是第一版试用包。

请先试一次默认设置，确认：7 个声部、32 小节、4/4、C 调、四分音符 100 BPM，以及 Solo／Tenor／Bass／Beatbox 的谱号和名称。再试 6/8、加入 Baritone 和 Rap。若加载失败，请提供 MuseScore 的完整版本号和错误信息。

## 后续顺序

1. 一键建谱（本版）
2. 同词同节奏复制到指定声部
3. 根据调号生成三度和声草稿
4. 声部音域检查
5. 根据填写的和弦符号生成和声／Bass 草稿

后续和声输出均为供听辨、修改的草稿。

## 技术依据

- MuseScore 官方源码：`src/engraving/api/v1/qmlpluginapi.h` 的 `readScore`；`part.h` 的声部名称属性是只读，因此本版通过 MusicXML 建谱，保留 Solo／Beatbox 等自定义名称。
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
