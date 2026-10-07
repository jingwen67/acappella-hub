# A Cappella Hub · CUCAC 使用指南

**中文** | [English](README.en.md)

CU Chinese A Cappella 的成员资料、乐谱库和 Solo 投票工具。投票与乐谱库使用同一个账号。

**网站入口：[打开 A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site)**

这是大家实际使用和分享的链接。GitHub 是代码仓库；打开网站不需要下载代码、不需要 GitHub 账号，也不需要运行程序。

<a id="quick-start"></a>
## 快速开始

**推荐大家先把网站添加到手机主屏幕，以后像打开 App 一样进入，查看乐谱和投票更方便。** 无需去 App Store 下载。

<a id="mobile"></a>
### 在手机上使用：添加到主屏幕

1. 用手机浏览器打开 [A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site)。
2. **iPhone：** 用 Safari 或 Chrome 打开，在分享菜单中选择 **添加到主屏幕 / Add to Home Screen**，再点击 **添加 / Add**。
3. **其他手机：** 在浏览器菜单中寻找 **添加到主屏幕 / Add to Home Screen** 或安装选项；是否显示及具体名称取决于浏览器。
4. 添加完成后，从手机主屏幕上的 **CUCAC** 图标打开，并登录自己的账号。

这是网站的主屏幕入口，需要联网使用。已有账号不用重新注册，手机和电脑登录同一个账号即可。

### 第一次使用

1. 从手机主屏幕的 **CUCAC** 图标进入，或打开上面的网站链接。
2. 第一次使用，点击 **第一次来？注册**，用自己的名字创建账号；已有账号则直接登录。
3. 在 **我的资料 / My profile** 补充个人信息。
4. 从主页进入 **全体成员 / Members**、**查看/上传乐谱 / Scores** 或 **Solo 投票 / Solo voting**。

## 目录

- [快速开始](#quick-start)
- [在手机上使用](#mobile)
- [成员日常使用](#members)
- [注册、登录与账号](#accounts)
- [我的资料](#profile)
- [全体成员](#roster)
- [Solo 投票](#voting)
- [查看乐谱](#scores)
- [上传与修改乐谱](#upload)
- [管理员与 Music Director](#management)
- [权限说明](#roles)
- [指定角色与管理成员](#manage-members)
- [开启、结束与删除轮次](#rounds)
- [常见问题](#faq)
- [首次连接 Google 乐谱库](#google-setup)
- [设置 Tips](#setup-tips)
- [以后修改网站](#changes)
- [开发与部署](#development)
- [本地运行](#local)
- [私密数据](#private-data)
- [Sites 托管版](#hosting)

<a id="members"></a>
## 成员日常使用

**手机使用推荐：** 先按上面的 [添加到主屏幕步骤](#mobile) 设置好入口。之后直接点击 **CUCAC** 图标，登录后就能查看乐谱、参加 Solo 投票和更新个人资料。

<a id="accounts"></a>
### 1. 注册、登录与账号

- **名字**是登录名：最多 20 个字符，建议使用其他成员能认出的名字。相同名字（不区分英文大小写）不能重复注册。
- **密码**为 4–72 个字符；请使用自己专门为这个网站设置的密码。
- 注册成功会直接进入主页。之后在另一台设备上，使用同一个名字和密码登录即可。
- 登录名与资料里的 **英文全名 / English full name** 是两个字段：修改全名不会修改登录名。
- 用完共享设备后，点击 **退出 / Log out**。
- 忘记密码时，请联系管理员。当前没有邮件找回密码功能；管理员可以重设普通成员的密码。

<a id="profile"></a>
### 2. 我的资料

从主页进入 **我的资料**，填写英文全名、代词、声部、学校、毕业年份、专业、Fun fact 和喜欢的食物，再保存。毕业年份填写四位数字，例如 `2027`。

可以上传 JPG、PNG、WebP 或 GIF 头像，头像文件需小于 5 MB。保存后的资料会出现在成员名单中，其他登录成员可以查看；只填写你愿意与社团成员分享的信息。

<a id="roster"></a>
### 3. 全体成员

- 成员按 **Active** 和 **Alumni** 分组。
- 点击成员名字可以查看其资料。
- 普通成员只能修改自己的资料，不能修改其他人的角色或账号。
- Music Director、Arranger 和社团职位标签由管理员或有相应权限的人设置，不能在个人资料里自行获得。

<a id="voting"></a>
### 4. Solo 投票

#### 参加一个轮次

1. 进入 **Solo 投票**，查看当前轮次的曲目和编曲者。
2. 想参加 Solo 选拔，点击参选按钮；参选后会出现在候选人列表中。
3. 如果不再参加，点击退出参选并确认。退出会删除本轮其他人投给你的票。

没有进行中的轮次时，等待 Music Director 开启。当前同一时间只允许一个轮次进行。

#### 给候选人投票

每位候选人有两个选项：

 | 页面选项 | 含义 | 
| --- | --- |
 | **好听！ | 觉得 TA 适合唱这首歌的 Solo。 | 
 | **我再听听 | 还不确定 TA 是否合适，希望再听听其他人。 | 

- 可以给多位候选人表达意见，并非只能选一个人。
- 对同一候选人，每个账号最多保留一个选择；点击另一选项会替换原来的选择。
- 再次点击已经选中的选项，会取消这个选择。
- 选择会自动保存，不需要另外点击“提交”。其他设备登录同一账号，也会读到这些选择。
- 轮次结束后不能继续修改本轮投票。

#### 谁能看结果？

普通成员可以看到自己选了什么，但不能查看所有人的汇总票数。**Music Director 和该轮指定的 Arranger** 可以查看本轮汇总结果；有资格查看的人也能看到相应历史轮次，最近最多显示 12 个已结束轮次。

结果用于帮助 Music Director 和编曲者作决定，系统不会自动指定最终 Solo。管理员身份本身并不自动提供汇总结果查看权限。

<a id="scores"></a>
### 5. 查看乐谱

1. 从主页进入 **查看/上传乐谱**。
2. 在 **查看乐谱** 区域选择学期，例如 `2026 Fall`。
3. 点击曲目文件夹，或学期文件夹链接，在 Google Drive 中查看、下载乐谱。

Google 乐谱库需要管理员先配置。若页面提示尚未设置好，联系管理员即可，成员不需要自己配置 Google Cloud。

网站账号与 Google 账号不是同一个系统。打开 Drive 文件仍受 Google Drive 的共享权限限制；若提示没有权限，确认登录了正确的 Google 账号，并向社团管理员申请该文件夹的访问权限。

<a id="upload"></a>
### 6. 上传与修改乐谱

只有被指定为 **Arranger** 的账号能上传和修改乐谱；仅拥有 Music Director 或其他社团职位，不会自动获得上传权限。

#### 上传新曲目

1. 进入 **查看/上传乐谱**，找到 **上传乐谱** 表单。
2. 填写曲名。
3. 选择编曲者，可以多选；名单没有相应名字时，输入名字并点击 **添加**。
4. 选择学期。
5. 勾选 **大歌 / All members**、**小组 / Small group**，至少选一项，也可以同时选两项。
6. 选择一个或多个文件，或使用支持文件夹选择的浏览器上传文件夹。
7. 点击 **上传**，等待成功提示。

文件会放到 `社团大文件夹 → 学期 → 曲名` 下，同时在 Google Sheets 乐谱索引中添加记录。常见乐谱格式包括 PDF、MuseScore `.mscz`、MusicXML `.musicxml` / `.xml` / `.mxl` 和图片。

线上版每次上传的**所有文件合计需小于 20 MB**，不是每个文件各有 20 MB。更大的曲目文件夹请分批添加；手机浏览器若不支持选择整个文件夹，可以改选多个文件。

#### 修改已有曲目

1. 点击 **修改已经上传过的曲目**。
2. 选择原学期，在曲名栏搜索并选中曲目。
3. 修改曲名、编曲者、性质或目标学期；也可以增加新文件、勾选要删除的旧文件。
4. 点击保存；只有保存后修改才会生效。取消修改会退出编辑。

编辑属于共享乐谱库操作，不只修改你自己看到的内容。系统目前允许 Arranger 编辑库中已有曲目，并未限定只能编辑本人上传的曲目；请按照社团约定操作。

<a id="management"></a>
## 管理员与 Music Director

<a id="roles"></a>
### 权限说明

角色可以组合，例如同一个成员同时为 Music Director 和 Arranger。

 | 身份 | 主要权限 | 
| --- | --- |
 | 普通成员 | 编辑自己的资料、查看成员和乐谱、参选和投票。 | 
 | Arranger | 上传和编辑乐谱；若被指定为某轮的编曲者，可查看该轮结果。 | 
 | Music Director | 指定 Arranger、开启和结束投票轮次、查看所有轮次结果、删除轮次。 | 
 | 管理员 | 设置成员角色与 Active/Alumni 状态、管理普通成员账号、配置 Google 乐谱库、结束或删除轮次。 | 
 | President、Vice President、Secretary、Treasurer、Media Chair | 成员名单中的职位标记，本身不额外授予上传或投票管理权限。 | 

`admin` 是管理账号，不是你自己的成员账号。建议先以自己的名字注册，再用 `admin` 给这个个人账号设置 Music Director / Arranger。管理员密码由负责人保管，不写入此公开 README。

<a id="manage-members"></a>
### 1. 指定角色与管理成员

1. 用管理员账号登录，进入 **全体成员**。
2. 点击角色编辑按钮，再点击目标成员名字展开设置。
3. 勾选 Music Director、Arranger 或其他职位，设置 Active / Alumni。
4. 点击保存；取消则放弃这次角色编辑。

Music Director 也可进入成员列表指定 Arranger，但不能指定 Music Director 或社团其他管理职位。成员改为 Alumni 时，系统会清除其 Music Director、Arranger 和其他在任职位标签。

管理员还可以在展开的成员设置中修改登录名、输入新密码或删除普通成员账号：新密码留空表示保持原密码；重设密码会使该账号原有登录会话失效。删除成员会移除相关参选和投票数据，请先确认对象。此界面不能修改或删除 `admin` 自身。

<a id="rounds"></a>
### 2. 开启、结束与删除轮次

1. Music Director 使用自己的成员账号登录，进入 **Solo 投票**。
2. 当前没有进行中的轮次时，填写轮次名称，并选择本轮 Arranger。
3. Arranger 必须是已获 Arranger 角色的 Active 成员；如果下拉列表为空，先去成员列表指定角色。
4. 点击开启轮次，让成员参选和投票。
5. 结束时点击结束轮次并确认。线上版仅允许 Music Director 或管理员执行结束操作；其他成员即使看到按钮，也不能成功结束轮次。
6. 查看历史结果；需要删除测试轮次时，在轮次管理区选择删除并确认。

**结束**会保留历史结果；**删除**会移除整个轮次及其参选、投票记录。请用结束来保存正式选拔结果。

<a id="faq"></a>
## 常见问题

 | 情况 | 怎么处理 | 
| --- | --- |
 | 不知道该打开哪个链接 | 使用顶部的 **网站入口**。GitHub 是代码仓库，`localhost` 是开发者本机地址。 | 
 | 注册提示名字已存在 | 尝试用原账号登录；忘记密码则联系管理员，不必重复注册。 | 
 | 我是 MD，但看不到上传表单 | 上传还需要 Arranger 角色，且管理员已配置 Google 乐谱库。 | 
 | 乐谱库提示尚未设置好 | 请管理员完成 Google 连接、设置索引表和大文件夹，并添加学期。 | 
 | 没有可以选择的轮次编曲者 | 先给至少一位 Active 成员指定 Arranger。 | 
 | 我看不到汇总票数 | 普通成员只看自己的选择。汇总结果仅供 MD 和该轮指定的 Arranger 查看。 | 
 | 没有进行中的投票 | 等待 MD 开启；已有轮次必须先结束，才能开启下一轮。 | 
 | 上传失败或请求太大 | 检查整个请求是否小于 20 MB、角色权限和 Google 连接是否有效。 | 
 | Drive 提示没有权限 | 确认 Google 登录账号及文件夹共享权限；网站账号不会替代 Google 权限。 | 
 | 投票或资料没有立即更新 | 确认操作成功，再稍等几秒；页面会定期刷新数据，必要时手动刷新。 | 

<a id="google-setup"></a>
## 首次连接 Google 乐谱库

这部分只需管理员设置，普通成员不用逐个授权 Google API。

### 准备共享文件夹和索引表

1. 在 Google Drive 准备社团乐谱的大文件夹，复制文件夹链接。
2. 准备一份 Google Sheets 索引表，复制表格链接。
3. 连接到网站的社团 Google 账号必须能编辑这两个资源。
4. 在表格的**第一个工作表**第一行设置以下列名：

 | A | B | C | D | E | 
| --- | --- | --- | --- | --- |
 | 曲名Song Title | 编曲Arranger | 学期Semester | 性质Type | 链接Link | 

如果第一行为空，首次成功上传会自动写入这些表头。使用完整的五列表头有助于确保索引信息齐全。

### 创建 Google OAuth 客户端

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，选择或创建社团使用的项目。
2. 启用 **Google Drive API** 和 **Google Sheets API**。
3. 按 Google Auth Platform 的引导配置应用名称、联系邮箱和受众；如果项目处于测试模式，把准备连接的社团 Google 账号加入 Test users。
4. 创建 **Web application** 类型的 OAuth 客户端。
5. 在 **Authorized redirect URIs** 中填写下面的完整地址：

```text
https://acappella-hub.elenazhang0607.chatgpt.site/api/google/callback
```

6. 保存 Client ID 和 Client Secret。Client Secret 只填写在网站的管理员设置中，不要上传到 GitHub。

Google 官方参考：[启用 Workspace APIs](https://developers.google.com/workspace/guides/enable-apis) · [Web Server OAuth 设置](https://developers.google.com/identity/protocols/oauth2/web-server)。

### 在网站中完成连接

1. 用 `admin` 登录网站，进入 **查看/上传乐谱 → 乐谱设置**。
2. 填写 Client ID、Client Secret、索引表链接和大文件夹链接。
3. 点击 **保存设置**。之后修改其他设置时，Client Secret 留空可保留已保存的密钥。
4. 点击 **连接 Google 账号**，选择社团 Google 账号并完成授权。
5. 返回网站，确认页面显示已连接的邮箱。
6. 输入学期名称，例如 `2026 Fall`，点击 **添加学期**。系统会在大文件夹下创建对应学期文件夹。
7. 给需要上传的人设置 Arranger，再用一个小文件测试上传及索引记录。

连接成功、索引表已设置并且至少有一个学期后，上传入口才可用。网站连接 Google 不会自动授予成员 Drive 文件访问权限；请另外设置社团文件夹的共享范围。

<a id="setup-tips"></a>
### 设置 Tips

- **Google 显示 `redirect_uri_mismatch`：** 检查 OAuth 客户端中的回调地址是否与上面的完整 HTTPS 地址一致。
- **Google 连接失效：** 管理员重新连接，并检查 Google 项目的受众、测试用户和授权状态。

<a id="changes"></a>
## 以后修改网站

GitHub 保存源码和修改历史；Sites 托管大家实际访问的版本。提交到 GitHub 不会自动更新线上网站。

需要修改时，可以告诉 ChatGPT：**“请修改……，同步 GitHub 并发布到现有网站。”** 修改代码、提交 GitHub、检查构建和发布是不同步骤；发布完成后仍使用上面的同一个网址。仅修改本 README，不需要重新发布网站。

---

<a id="development"></a>
## 开发与部署

以下内容供维护代码的人使用。日常成员使用不需要执行命令。

<a id="local"></a>
### 本地运行

需要 Node.js 22 或更新版本。

```sh
npm start
```

在运行程序的电脑上打开 `http://127.0.0.1:4173`。同一网络中的其他设备可以使用终端显示的网络地址。

<a id="private-data"></a>
### 私密数据

本地运行数据保存在 `data/` 中，并刻意排除在 Git 之外，包括账号、密码哈希、会话、投票、头像和 Google OAuth 配置。

<a id="hosting"></a>
### Sites 托管版

原始 Node 服务器保留在 `server.js`。托管版位于 `worker/`：从 `public/` 打包原始界面，共享记录保存在 D1，头像和私密 Google 配置保存在 R2。

- `npm run build:hosted` 构建 Worker。
- `npm run check:hosted` 验证 Worker 运行环境中的账号、角色、投票、结果可见性、头像、删除和 Google 配置流程。
- `.openai/hosting.json` 保留 Site 标识和逻辑存储绑定。
- 数据库结构修改放在 `db/schema.ts`，使用 `npm run db:generate` 生成增量迁移。不得改写已发布的迁移文件。
- 首次使用 API 前，将 `ADMIN_PASSWORD` 配置为托管密钥，并将 `PUBLIC_ORIGIN` 设置为正式 HTTPS 网站地址。管理员密码不得写入源码或部署日志。修改初始化密钥不会重设已有账号。
- 托管账号使用 PBKDF2 密码哈希，以及带有 Secure、HttpOnly、SameSite=Lax 属性的会话 Cookie。
- ZIP 源码未包含原有账号、投票、头像或 Google 凭据。托管版最初使用新数据库，需要管理员配置 Google 并由社团账号授权。
- Google Cloud 必须允许 `<PUBLIC_ORIGIN>/api/google/callback`，并启用 Drive 和 Sheets API。Client Secret 仅存入管理员设置。
- 为控制 Worker 内存占用，托管版 multipart 上传限制为**每次请求总计 20 MB**。更大的文件夹需分批上传。
- 此仅包含 Worker 的项目无法在托管预览中验证浏览器界面和 WebMCP；API 流程已在 Worker 运行环境中验证。
- Sites 在公开测试期间目前包含于符合条件的 ChatGPT 方案中，并受方案用量限制；这不保证永久免费托管。

线上网站：[A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site)

`worker/assets.js` 由托管构建从 `public/` 自动生成，不纳入此仓库的版本管理。GitHub 提交不会自动重新部署 Sites；需要上线时，请将更新后的源码发布到现有 Site。
