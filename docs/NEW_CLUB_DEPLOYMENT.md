# 独立社团 Hub · New club deployment

新团使用同一套程序，但必须有独立的网站、Supabase 项目、私有存储和 Google 乐谱库。临时名称在 `clubs/new-club.json`，以后可修改团名和简称。

## 当前准备情况

- 功能代码沿用 CUCAC 最新版本。
- 新团业务数据从空白开始；没有成员、邀请码、投票、照片、录音、乐谱、演出阵容或旧学期。
- 原团的 Workshop 文档和文件不会发布到新站。入口保留，暂时显示「暂无资料」。
- 新团使用通用 H 图标，正式 Logo 之后替换。
- 当前 Supabase 连接仅能看到 CUCAC 组织。应先创建或连接新团的组织。
- 新站尚未上线；不要把下面的初始化操作应用到现有 CUCAC 项目。

## 1. 新组织与数据库

1. 在 https://supabase.com/dashboard 创建新组织，或让新团负责人邀请你加入已有组织。用同一登录账号时，建好后可重新检查连接是否能看到该组织。
2. 在新组织下创建一个新的 Supabase 项目。先确认界面显示的方案及价格；本指南不要求升级付费方案。
3. 打开这个**新项目**的 SQL Editor，运行 `vercel/new-club-schema.sql` 一次。该文件会拒绝覆盖已经存在的 Hub。
4. 再运行 `vercel/new-club-storage.sql`，建立私有 `hub-private` bucket。
5. 初始化只创建表结构，不导入 CUCAC 数据。首次服务器运行会建立独立的管理员账号。

初始化文件由 `node scripts/new-club-init.mjs` 从最新完整 schema 生成；更新代码后为另一个空白项目初始化时，应重新生成。

## 2. 新 Vercel 项目

从 https://vercel.com/new 导入 `jingwen67/acappella-hub`，创建另一个项目，例如 `acappella-hub-new`。验证项目名称与生产分支后再发布，不要修改现有 `cucac-hub` 项目的设置。

当前准备分支是 `feature/new-club-isolated`。原 CUCAC 项目若自动触发此分支预览，因为没有新团配置，构建会主动停止；该预览不是新团网站。在 Vercel 中将新项目生产分支设为该分支。Build Command 为 `npm run build:vercel`，Output Directory 为 `public`。

在**新项目**内配置 `clubs/new-club.env.example` 列出的变量：

| 变量 | 新项目中的值 |
|---|---|
| `HUB_PROFILE` | `new-club` |
| `HUB_SUPABASE_PROJECT_REF` | 新 Supabase 项目 ID |
| `DATABASE_URL` | 新项目的 PostgreSQL URI；pooler 用户名为 `postgres.项目ID` |
| `SUPABASE_URL` | `https://新项目ID.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 新项目的服务端 key，只放在 Vercel 环境变量 |
| `SUPABASE_STORAGE_BUCKET` | `hub-private` |
| `ADMIN_PASSWORD` | 新站独有的管理员密码，在 Vercel 中私下设置 |
| `PUBLIC_ORIGIN` | 新站正式 HTTPS 地址，不带路径或结尾斜线 |

不要把密码、数据库连接串或 key 提交到 GitHub，也不需要发到聊天里。代码会核对数据库和存储的项目 ID，并拒绝新团使用 CUCAC 当前的 Supabase 项目或网址。

## 3. 新团首次使用

1. 用新站自己的管理员账号登录，建立邀请码，让新团成员注册。
2. 给负责人设置 MD 等角色，按需要建立新学期和阵容。
3. 用新团的 Google Drive 文件夹与 Sheet 连接乐谱库。OAuth 客户端添加新站 `/api/google/callback`；在新站完成独立授权。不要填写 CUCAC 的曲库链接。
4. 后续可修改 `clubs/new-club.json` 中的名称。正式图标可扩展该构建配置；当前通用图标不会使用 CUCAC 的 Logo。
5. Workshop 内容为空是预期状态。准备好新团自己的材料后，将相应发布材料加入独立配置，再打开 Workshop 内容。

## 4. 后续共同更新

准备分支基于现有生产代码，后续可合并功能更新。两个 Vercel 项目各自配置、各自数据库；**部署代码不会迁移或复制内容**。目前新分支并不会自动跟随 CUCAC 分支更新，更新后需同步分支再部署。

只有在配置支持经过验证并合入共同生产分支后，两个项目才可同时追踪同一分支，以各自的 `HUB_PROFILE` 选择品牌。CUCAC 的默认构建无需设置该变量；新团构建必须从干净 checkout 开始，不能将已生成的新团页面作为其他团的源码。
