# grok-build-web

给已经安装本机 **Grok Build**（`grok` CLI / TUI）的用户做的 **Web 可视化操作台**。参考 Codex / DeepSeek harness 的信息架构：左侧管项目和历史会话，中间是文档流对话，底部是输入坞。

本仓库通过 Vite 插件拉起 `grok agent --no-leader stdio`（ACP JSON-RPC），浏览器只改这个文件夹里的文件，**不要改 Grok Build 安装目录**。

## 这文件夹要做什么

1. 提供和 Codex 类似的桌面级工作台（黑底、白字、少装饰）。
2. 让本机 Grok Build 用户能用鼠标：建对话、选项目文件夹、看历史、改资料。
3. 权限、模型、思考强度的文案和档位与 Grok Build TUI 对齐，并接到 ACP。
4. **不要**在这个仓库里写 exploit、攻击脚本。未连上时不要假装已经接通。

## 怎么跑

本机需要已安装 `grok` 并完成登录（`grok login` 或可用的默认模型密钥）。

```bash
npm install
npm run dev      # http://localhost:5173/  （同时拉起 grok agent stdio）
npm run build
npm run preview  # 预览构建，同样走 ACP 桥
```

桌面快捷方式：`scripts/open-grok-build.ps1`（图标 `public/grok-icon.ico`）。双击会起 `npm run dev` 并打开浏览器。

Node 20+。栈：Vite 8 + React 19 + TypeScript。无 UI 库，样式在 `src/index.css`。

## 架构

| 路径 | 职责 |
| --- | --- |
| `server/plugin.ts` | Vite 插件：dev / preview 时挂 ACP HTTP |
| `server/acp.ts` | 拉起 `grok agent --no-leader stdio`，JSON-RPC |
| `server/http.ts` | `/api/status` `/api/sessions` `/api/git` 与流式 prompt、cancel |
| `server/git.ts` | 读分支、`git checkout`（有 git 的项目才显示分支芯片） |
| `server/prompt-title.ts` | 从 `updates.jsonl` 抽第一条用户消息当标题 |
| `server/transcript.ts` | ACP `session/update` → 文档流事件 |
| `src/workspace.tsx` | 客户端状态（reducer + context），发送 / 暂停 / 等候队列 |
| `src/lib/agent.ts` | 浏览器调 `/api/*` |
| `src/lib/title.ts` | 标题：手动重命名 > 首条用户消息 > grok 自动标题 |
| `src/types.ts` | 项目 / 会话 / 权限 / 模型 / 思考强度 / 等候队列 |
| `src/data/seed.ts` | 初始项目列表（会话来自 grok） |
| `src/lib/storage.ts` | `localStorage` 键 `grok-build-web.v5` |
| `src/components/Sidebar.tsx` | 侧栏：项目手风琴、会话、搜索、用户菜单 |
| `src/components/ChatPane.tsx` | 空状态 + 文档流 + 连接状态 |
| `src/components/Composer.tsx` | 输入坞：项目、分支、附件、权限、模型、暂停、等候 |
| `src/components/Popover.tsx` | 菜单；侧栏 `...` 用 `portal` 避免被裁切 |
| `src/components/Settings.tsx` | 全屏设置（目前只有个人资料） |
| `scripts/` | 圆角 ico、桌面快捷方式启动脚本 |
| `public/grok-icon.png` | 站点图标 |

状态流：侧栏选项目/会话 → `workspace` → `ChatPane` / `Composer`。发送时 `session/new` 或复用已有会话，再 `session/prompt`。暂停走 `session/cancel`。

## 产品约定（已拍板）

- 主题：近黑底 + 暖白字，不要酸绿、不要假窗口控件。
- 会话是 **文档流**，不是聊天气泡。用户消息（含第一句）是右对齐胶囊；标题用首条用户消息的语言，不要被 grok 英文自动标题盖掉。手动重命名优先。
- 顶栏只要标题 + 连接状态，**不要**分享 / 更多。
- 权限四档与 TUI Shift+Tab 一致：询问 / 计划 / 自动 / 始终批准。新会话通过 ACP `_meta`（`yoloMode` / `autoMode`）生效。
- 模型列表以 agent `initialize` 返回为准。思考强度是 **点当前模型才展开的子菜单**，向右弹出并钳在视口内。
- 输入坞 **不要**「本地」芯片、**不要**语音按钮。
- 新建项目只选名称和文件夹，**不要**填分支。对话里的分支芯片：仅当该会话属于项目 **且** 项目有 git 分支时才显示。
- 「不在项目中工作」对**尚未发出去的草稿**要把 cwd 改成用户主目录，不要沿用上一个项目路径。已经在 grok 里建好的会话改不了 agent cwd。
- 左上角 Grok 是字标，不是下拉；没有通知铃。
- 搜索放大镜再点一次收起。
- 侧栏项目：点击展开/收起该项目下的会话。`...`：编辑项目、删除所有聊天（菜单必须 portal 到 body，避免被侧栏裁切）。最右图标：在该项目新建会话。区块标题「项目」字号约 13px；创建项目用文件夹加号图标，不要裸 `+`。悬停提示用暗色自定义 hint，不要系统 `title`。
- 会话行悬停显示删除。删除成功要有成功 toast（挂 `document.body`，z-index 高于设置页）。
- 输入坞项目芯片：悬停时文件夹变 `x`，点击即「不在项目中工作」。
- 工具卡片：默认只显示一条，点「已调用 N 个工具」展开。状态三档：成功 / 失败 / 进行中，不要写「完成」。
- 复制按钮只出现在每一轮**最后一段结果**上，中间推理摘要不要复制。
- 生成中、输入框为空：发送钮变成暂停（`session/cancel`）。生成中再输入并发送：进入等候列表，可立即发送 / 编辑 / 删除，不要自动发出。
- 左下角头像 → 设置 → 全屏二级页改头像和名字。保存成功同样走成功 toast。

## 数据

- 持久化：`localStorage['grok-build-web.v5']`（项目、权限、模型、思考强度、个人资料、标题覆盖）。会话正文在 `~/.grok/sessions`，由 grok 管。
- 设置开合、搜索框开合、思考中状态、等候队列不落盘。
- 头像压成 256×256 JPEG data URL。
- 浏览器文件夹选择器拿不到完整路径，新建项目时路径需用户确认。

## 协作注意

- 改 UI 后用浏览器走一遍，不要只截一张图。热更新曾经把已删符号留在运行时（例如 `IconShare is not defined`），出黑屏或「界面出错」时先 **重启 `npm run dev` + Ctrl+F5**。改 `server/` 后也要重启 Vite，插件不会热替换 grok agent 进程。
- `src/ErrorBoundary.tsx` 会把运行时错误打在页面上，不要删掉。
- 中文 UI 文案与 Grok Build 用户指南保持一致，不要写成 Codex 的「完全访问」等旧标签。
- 不要修改 Grok Build 安装目录或 `~/.grok` 里的程序文件。读会话、调 `grok agent stdio` 可以。
