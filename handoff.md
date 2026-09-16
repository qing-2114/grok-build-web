# Handoff — grok-build-web

日期：2026-09-17  
仓库：`F:\grok-build-web`  
范围：前端 MVP 已接通本机 Grok Build，并按使用反馈改了侧栏、文档流、发送坞。**只改本仓库**，没有改 grok-build 安装文件。

下一位：先读根目录 `AGENTS.md`，再读本文。开发服务：`http://localhost:5173/`。黑屏或「界面出错」时 **停掉旧 Vite，重新 `npm run dev`，浏览器 Ctrl+F5**。改 `server/` 后必须重启 Vite。

## 目标回顾

1. 把 mock 前端接到本机 `grok agent --no-leader stdio`（ACP）。
2. 桌面快捷方式：圆角 grok 图标，一点就起服务并打开网页。
3. 按截图和口头反馈修交互（项目手风琴、工具卡片、cwd、气泡、删除 toast、菜单裁切、标题语言、暂停与等候队列）。

## 当前能力

### 接入

- Vite 插件 `server/` 拉起 grok agent stdio。
- HTTP：`/api/status`、会话 list/new/load/prompt/cancel/delete、git、权限回调。
- 发送：`session/new` 或复用会话 + `session/prompt`；暂停：`session/cancel`。
- 未连接时不要假回复。本机默认模型可能是 `cloudborne-grok-4.6`；未登录时选 `grok-4.6` 会 401。

### 桌面

- `public/grok-icon.ico`：从 `grok-icon.png` 做的透明圆角多尺寸图标。
- `scripts/open-grok-build.ps1`：5173 没起来就 `npm run dev`，起来后打开浏览器。
- 桌面快捷方式：`%USERPROFILE%\Desktop\Grok Build.lnk`。

### 侧栏

- 项目可展开/收起；`...` 编辑项目或删除该项目全部聊天（菜单 **portal 到 body**）；最右为项目内新建会话。
- 「项目」标题 13px；创建项目用文件夹加号，悬停暗色 hint。
- 会话悬停删除；删除成功 toast 挂 `document.body`。
- 标题优先首条用户消息的语言，不要被 grok 英文自动标题盖掉。列表阶段用 `server/prompt-title.ts` 读 `updates.jsonl`。

### 文档流

- 用户消息（含第一句）都是右对齐胶囊。
- 工具卡片默认一条，点标题展开；状态：成功 / 失败 / 进行中。
- 复制只在每一轮最后一段助手结果上。

### 输入坞

- 项目芯片悬停：文件夹变 `x` → 不在项目中工作。草稿要把 cwd 设成主目录。
- 生成中且输入为空：发送钮变暂停。
- 生成中再发送：进入等候列表（立即发送 / 编辑 / 删除），不自动发出。

## 怎么验证

1. `npm run dev` → 顶栏「已连接 · 版本号」。
2. 发一句短消息，应有真实流式回复。
3. 生成中点暂停；再输入发送应进等候列表。
4. 点项目 `...`，「编辑项目 / 删除所有聊天」应完整浮在侧栏外。
5. 删一条会话，底部应弹出带对勾的「已删除会话」。

## 刻意没做 / 下一步

- 没有改 grok-build 源码；没用 `grok agent serve` WebSocket。
- 已建好的 grok 会话改不了 agent cwd（「不在项目中工作」只对草稿生效）。
- 询问模式权限框已接，未做细粒度规则编辑。
- 浏览器仍拿不到完整 Windows 路径。
- 超大历史 `session/load` 仍较慢。
- 等候队列不落盘；附件排队目前折进文本。
