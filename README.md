# Grok Build Web

本机 [Grok Build](https://x.ai) 的可视化操作台：左侧管项目和会话，中间是文档流对话，底部是输入坞，右侧可打开审查、终端和文件。

`npm run dev` 会拉起 `grok agent --no-leader stdio`，通过 ACP 把流式回复、工具调用、项目目录和 git 分支接到浏览器。

## 快速安装

把下面这段交给智能体（100 字以内）：

> 克隆本仓库，执行 npm install 与 npm run dev。用 public/grok-icon.ico 作图标，在桌面创建指向 scripts/open-grok-build.ps1 的快捷方式，用于启动服务并打开网页。

## 你需要什么

- [Node.js](https://nodejs.org/) 20 或更高
- 本机已配置好的 [Grok Build](https://x.ai) CLI（终端能执行 `grok --version`）
- Chromium 内核浏览器（文件夹选择器用得到）

![空白工作台](docs/screenshots/workbench.png)

![右侧栏](docs/screenshots/right-rail.png)

## 部署

```bash
git clone https://github.com/qing-2114/grok-build-web.git
cd grok-build-web
npm install
npm run dev
```

浏览器打开终端里的地址（默认 `http://localhost:5173/`）。顶栏应显示 **已连接** 和 Grok Build 版本号。

首次打开会看到占位项目 `example1` / `example2`。点 **新建项目** 换成你自己的文件夹，或删掉这两个例子。

### 生产预览

```bash
npm run build
npm run preview
```

预览同样会挂 ACP 桥，不要把端口暴露到公网。这是给本机 `127.0.0.1` 用的操作台。

### 桌面快捷方式（Windows）

仓库里有 `scripts/open-grok-build.ps1`。可在桌面建快捷方式，目标：

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "你的路径\grok-build-web\scripts\open-grok-build.ps1"
```

图标可用 `public/grok-icon.ico`。点开后会启动 `npm run dev` 并打开浏览器。

## 现在能做什么

- **新建对话**：空画布，中间是 Grok 图标；第一条消息会在对应项目目录下创建一条 grok 会话
- **新建项目**：用系统文件夹选择器或手动填写路径；有 git 时才出现分支芯片
- **项目列表**：点击展开该项目下的会话；`...` 可编辑项目或删除全部聊天
- **会话区**：文档流（标题 + 正文 + 工具卡片），不是聊天气泡；暂停生成；等候队列
- **输入坞**：项目、git 分支（会真实 `checkout`）、权限（询问 / 计划 / 自动 / 始终批准）、模型 + 思考强度、附件、斜杠命令
- **右侧栏**：审查当前文件夹的 git 更改；在会话目录打开集成终端（可在设置里选 PowerShell / Command Prompt / Git Bash / WSL）；浏览并预览文件（代码高亮、Markdown、PDF、Word）
- **文件链接**：对话里的路径单击即可在右侧预览；网页用 Ctrl+单击在系统浏览器打开
- **侧栏宽度**：左右侧栏都可以拖动；双击边缘恢复默认宽度

## 没连上时

界面会显示 **本机未连接**，发送会失败并提示。请确认：

1. 本机 Grok Build CLI 已配置好（`grok --version` 可用）
2. 重启 `npm run dev` 后再硬刷新（Ctrl+F5）

## 界面约定

- 文档流而不是聊天气泡；用户消息是右对齐胶囊
- 权限：询问 / 计划 / 自动 / 始终批准
- 有 git 的项目才显示分支芯片
- 生成中可暂停；再输入发送会进入等候列表
- 右侧栏用可关闭的标签打开文件，不是固定三个按钮

项目和个人资料存在浏览器 `localStorage` 键 `grok-build-web.v5`。会话正文由本机 grok 存在 `~/.grok/sessions`。
