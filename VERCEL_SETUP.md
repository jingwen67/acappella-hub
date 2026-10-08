# CUCAC Hub：独立 Vercel 版 / Independent Vercel edition

此分支使用 Vercel + Supabase。原 Sites 网站继续运行；这份配置不会迁移或修改 Sites 数据。新版本启用邀请码注册，已有账号登录时不需要邀请码。

This branch runs on Vercel and Supabase. The existing Sites website stays live. Its accounts and data are not imported automatically. Invitations are required only when creating an account.

## 1. 创建数据库 / Create the database

在 Supabase 创建一个新项目。打开 SQL Editor，执行 `vercel/schema.sql`，仅执行一次。请使用新数据库，不要对已有团员数据库运行这份初始化文件。

Create a new Supabase project and run `vercel/schema.sql` once in its SQL Editor. This initializes a separate database.

在 Storage 创建 **private** bucket，名称为 `cucac-private`。不要设为 public：照片和 Google 连接配置只通过服务器访问。

Create a private Storage bucket named `cucac-private`. Photos and Google connection settings are accessed through the server.

## 2. 配置 Vercel / Configure Vercel

Import Git Repository → `jingwen67/acappella-hub`。将 Production Branch 设为 `feature/vercel-independent-hub`；Framework Preset 选 Other；Build Command 为 `npm run build:vercel`；Output Directory 为 `public`。Node.js 选择 22.x 或更新的受支持版本。

Import the repository, select this branch as the production branch, use Other as the framework, and use the build and output settings above.

在项目 Settings → Environment Variables 配置：

| Variable | 中文说明 / Description |
| --- | --- |
| `DATABASE_URL` | Supabase Connect 页面中的 Transaction pooler PostgreSQL 地址（端口 6543），包含数据库密码。 / Transaction pooler connection string, including the database password. |
| `SUPABASE_URL` | Supabase 项目 URL。 / Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 service_role key。不能放到浏览器代码、GitHub 或 NEXT_PUBLIC 变量中。 / Server-only service role key. |
| `SUPABASE_STORAGE_BUCKET` | `cucac-private` |
| `ADMIN_PASSWORD` | 为新版本单独设置强密码，管理员用户名为 `admin`。 / A strong password for the new administrator account, named `admin`. |
| `PUBLIC_ORIGIN` | 新 Vercel 网站完整 HTTPS 地址，不含末尾 `/`。 / Canonical HTTPS website origin, without a trailing slash. |
| `DATABASE_CA` | 如果连接需要 Supabase 自定义 CA，填写 Connect 页面提供的 CA PEM 证书。生产环境保持 TLS 证书验证开启。 / Supabase CA PEM if required; keep TLS verification enabled. |

首次部署得到域名后，补上正确的 `PUBLIC_ORIGIN` 并 Redeploy。不要使用 `NEXT_PUBLIC_` 前缀保存任何密钥。管理员密码只用于初始化；以后在界面中修改密码。

After the first deployment provides a domain, set `PUBLIC_ORIGIN` to that domain and redeploy. Secrets must remain server-side. `ADMIN_PASSWORD` initializes the account; later changes use the account settings.

## 3. 邀请成员 / Invite members

用 `admin` 登录 → 全体成员 → 生成邀请码。把邀请码私下发给一位成员：新生成的码可以发给全团多人注册，7 天后到期，可以提前撤销；已有一次性码保持原规则。成员注册后，日常直接用名字和密码登录，不需要再次输入邀请码。

Log in as `admin`, open Members, and create an invitation. New codes support multiple registrations, expire after seven days, and can be revoked. Existing single-use codes keep their original rules. Members then log in normally with their name and password.

## 4. Google 乐谱库 / Google score library

在现有 Google OAuth 客户端中添加新回调地址：`https://你的新域名/api/google/callback`。保留原 Sites 回调。然后在新 Hub 管理员设置中填写客户端信息并重新连接。授权与配置不会从 Sites 自动复制。

Add the new callback URL to the existing OAuth client, keep the Sites callback, and connect Google from the new Hub administrator settings. Existing Sites authorization is not copied.

## 5. 上线检查 / Launch checks

确认管理员登录、邀请码注册、投票、相册上传和 Google 连接正常后再邀请全团。相册单张照片最多 3 MiB；上传的乐谱请求最多 4 MiB。两个网站分别保存数据，上线前需要另行安排现有成员和数据迁移。

Check login, invitations, voting, photos, and Google connectivity before inviting everyone. Photos are limited to 3 MiB each; uploaded score requests to 4 MiB. Plan a separate migration before replacing Sites.

官网之后可以添加 Members’ Hub 按钮，直接链接到这个 Vercel 地址；不需要把两个项目合并。官网仍公开，Hub 数据接口仍需要登录。

The public website can link to this Hub without merging the projects. The public website remains public; Hub data APIs require authentication.

## 本地验证 / Local verification

```sh
npm ci
npm run build:vercel
npm run check:vercel
```

测试使用内存中的 PostgreSQL 引擎，覆盖邀请码、权限、投票、资料、相册和 Google 回调。真实 Supabase Storage 和 Vercel 部署仍需要云端检查。

Tests use an embedded PostgreSQL engine. Live Supabase Storage and Vercel deployment need a separate cloud check.

## Solo 投票 / Solo voting

新轮次默认使用「默认投票」：两人场每人一票，开始后锁定报名；三人及以上每人最多两票。也可选择「点赞投票」，保留好听/再听听。MD 点击开始后，原参选人随机排序，后来的人排在后面。结果按支持票排序，普通成员看到第1、2名的所有并列者；MD可逐名揭晓，只有admin看全部票数。

New rounds default to Default voting: one choice for two candidates (registration locks at start), or two choices for three or more. Like voting retains both feedback buttons. Starting shuffles existing candidates; later entries append. Members see all ties at ranks 1 and 2; the MD can reveal further ranks; counts remain admin-only.

## Duet voting

The MD can select Duet · Pair Voting or Duet · Part Voting when opening a round. Pair Voting requires partner confirmation. Part Voting uses independent ballots and rankings for A and B. The additive upgrade SQL is in `vercel/duet-schema.sql`; new installations include it in `vercel/schema.sql`. Existing rounds default to Solo and keep their original votes. Run `npm run build:vercel`, `npm run check:vercel` and `node scripts/check-duet-ui.mjs` before deploying changes.

## 投票录音 / Voting recordings

现有项目先运行 `vercel/recording-schema.sql`；新项目的 `vercel/schema.sql` 已包含录音表。继续使用私有 `cucac-private` bucket。音频通过短效签名上传地址直接传到 Storage，不经过 Vercel 请求正文，因此不受应用 4 MiB 请求限制；服务端核验文件大小与类型，单个音频最多 50 MiB。播放需登录，签名播放地址最长一小时，且不超过本轮保留期限。

录音在轮次结束后 7 天停止展示与播放。`vercel.json` 的每日 Cron 调用 `/api/recordings/cleanup` 清理到期文件；实际删除最迟在下一次每日任务完成。清理接口不接受目标 ID，只删除服务器判定到期的录音及超过一天的未完成或失去报名关联的上传，不需要新增环境变量。麦克风需 HTTPS 和用户授权；离开投票页面时停止录制。

Run `npm run build:vercel`, `npm run check:vercel`, `node scripts/check-duet-ui.mjs`, and `node scripts/check-recording-ui.mjs` before deploying. Browser microphone hardware and permissions should also be checked on the member’s device.

## Song Plan 人员表升级

现有项目运行 `vercel/plan-schema.sql`，新增私有学期、歌曲和报名表，并创建空的 2026 Fall；新安装已包含在 `vercel/schema.sql` 中。不改已有账号、乐谱和投票，也不需要新环境变量。表启用 RLS，不向匿名或 Supabase 客户端角色开放；应用继续通过后端连接使用。

学期变更、报名、歌曲锁定与归档共用学期行锁，避免锁定后仍写入报名。归档时保存成员快照；删除账号不会删除旧歌曲报名记录。曲库选择直接读取现有 Google Sheet 索引，需已有 Google 授权。

验证：`npm run build:vercel`；`PLAN_UI_FIXTURE=/tmp/plan-state.json npm run check:vercel`；`node scripts/check-plan-ui.mjs /tmp/plan-state.json`。页面测试使用 Happy DOM 验证导航、报名、文件夹链接、曲库选择、输入保护、手机表格切换和归档只读；布局仍可在实际手机与电脑上复核。

## Plan 批量选歌与 Sheet 演出学期

升级已有项目需运行 `vercel/plan-sheet-schema.sql`；新安装已包含在 schema 中。批量选歌按 Google Sheet 的演出学期筛选，实际乐谱文件夹保持原位置。每次添加或关联曲目，将学期追加任务与 Plan 一起提交；Google 更新在事务提交后处理，只修改 Semester 单元格，保留曲名、编曲和链接公式。Google 失败不会回滚人员表，待同步任务保存在私有表中。MD 可以重试；已有每日清理 Cron 同时重试同步。学期同名忽略大小写与空格，不重复写入。

新增验证：`node scripts/check-plan-sheet.mjs`；批量选择、学期筛选和全选由 `scripts/check-plan-ui.mjs` 检查。

## 乐谱页阵容与曲目选择升级

运行 `vercel/plan-selection-schema.sql` 为已有歌曲增加 excluded 标记，新安装已包含在 schema 中。保留已有学期、歌曲和报名；移除只设置标记，重新加入同一乐谱文件夹复用原记录。乐谱页按 semesterId 从服务端读取 Google Drive 文件夹，按学期名（忽略大小写和空格）关联人员表，自动纳入新曲，保留手动排除，归档后不自动改写曲目。President 与 MD 可选曲；替他人安排声部和归档仍需 MD 权限。

验证覆盖学期自动关联、移除后刷新、重新加入保留报名、权限边界，以及从 Scores 打开阵容与选曲。

额外联通验证：`node scripts/check-plan-library.mjs`，覆盖真实 Worker 路由、Drive 文件夹与快捷方式发现、自动关联学期、手动排除和重新加入。
