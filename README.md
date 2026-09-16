# Grok Build Web

本机 [Grok Build](https://x.ai) 的可视化操作台。给已经安装 `grok` 的用户一块 Codex 式的工作台：左侧管项目和历史会话，中间写对话。

`npm run dev` 会在本机拉起 `grok agent --no-leader stdio`，通过 ACP 把流式回复、工具调用、项目目录和 git 分支接到界面。

## 跑起来

本机需要已安装 `grok` 并已登录。

```bash
npm install
npm run dev
```

浏览器打开终端里给出的本地地址（默认 `http://localhost:5173`）。顶栏应显示 **已连接** 和 Grok Build 版本号。

桌面快捷方式（`Grok Build.lnk`）会跑 `scripts/open-grok-build.ps1`：服务没起来就 `npm run dev`，起来后打开网页。

## 现在能做什么

- **新建对话**：空画布；第一条消息会在对应项目目录下创建一条 grok 会话
- **新建项目**：用系统文件夹选择器（Chromium）或手动填写路径；有 git 时才出现分支芯片
- **项目列表**：点击展开该项目下的会话；`...` 可编辑项目或删除全部聊天
- **会话区**：文档流（标题 + 正文 + 工具卡片），不是聊天气泡；暂停生成；等候队列
- **输入坞**：项目、git 分支（会真实 `checkout`）、权限（询问 / 计划 / 自动 / 始终批准）、模型 + 思考强度、附件

项目和个人资料存在 `localStorage` 键 `grok-build-web.v5`。会话存在 grok 自己的 `~/.grok/sessions`。给代理看的说明在 `AGENTS.md`。

## 没连上时

界面会显示 **本机未连接**，发送会失败并提示，不会再用假回复充数。确认：

1. `grok --version` 能跑
2. 已经 `grok login`（或本机默认模型有可用密钥）
3. 重启 `npm run dev` 后再硬刷新
