import type { Project, Session } from '../types'
import { uid } from '../lib/uid'

const hoursAgo = (h: number) => Date.now() - h * 3600_000

export const SEED_PROJECTS: Project[] = [
  {
    id: 'proj_wechat',
    name: '公众号写作',
    path: 'F:\\公众号写作',
    branch: 'master',
    branches: ['master', 'draft', 'feat/next-issue'],
  },
  {
    id: 'proj_hello',
    name: 'my-hello-agent',
    path: 'F:\\my-hello-agent',
    branch: 'master',
    branches: ['master', 'dev'],
  },
  {
    id: 'proj_blog',
    name: 'blog',
    path: 'F:\\blog',
    branch: 'main',
    branches: ['main'],
  },
  {
    id: 'proj_obsidian',
    name: 'MyObsidian',
    path: 'F:\\MyObsidian',
    branch: 'main',
    branches: ['main'],
  },
  {
    id: 'proj_web',
    name: 'grok-build-web',
    path: 'F:\\grok-build-web',
    branch: 'master',
    branches: ['master', 'feat/ui'],
  },
]

function msg(
  role: Session['messages'][number]['role'],
  content: string,
  at: number,
  tool?: Session['messages'][number]['tool'],
): Session['messages'][number] {
  return { id: uid('msg'), role, content, createdAt: at, tool }
}

const ABLATION_ARTICLE = `消融实验（Ablation Study）是一种用来判断“模型中各个模块到底有没有用、贡献有多大”的实验方法。

核心做法是：在保持其他条件尽量相同的情况下，逐个去掉或替换某个模块，然后比较性能变化。

例如，一个目标检测模型包含：

- 主干网络
- 注意力模块
- 数据增强
- 损失函数改进

可以设计如下实验：

| 模型 | 注意力 | 数据增强 | 损失函数 | mAP |
| --- | --- | --- | --- | --- |
| 完整模型 | 有 | 有 | 改进 | 85.2 |
| 去掉注意力 | 无 | 有 | 改进 | 83.7 |
| 去掉数据增强 | 有 | 无 | 改进 | 81.9 |
| 使用普通损失 | 有 | 有 | 普通 | 84.1 |

如果去掉注意力后 mAP 从 85.2 降到 83.7，就说明注意力模块对性能有一定贡献；下降越明显，通常说明该模块越重要。

它主要回答三个问题：

1. 某个改进模块是否有效？
2. 不同模块分别贡献了多少？
3. 模型性能提升是否真的来自提出的方法，而不是其他因素？

常见类型包括：

- **逐模块消融：** 一次去掉一个模块。
- **累积消融：** 从基础模型开始，逐步加入模块。
- **替换实验：** 把提出的方法替换成已有方法。
- **参数消融：** 测试不同参数、层数或阈值的影响。

需要注意的是，消融实验必须尽量控制变量，例如使用相同的数据集、训练轮数、随机种子和评价指标，否则结论可能不可靠。

一句话概括：**消融实验就是拆解模型，逐个检查每个组件的实际作用。**`

export const SEED_SESSIONS: Session[] = [
  {
    id: 'ses_ablation',
    title: '解释消融实验',
    projectId: 'proj_wechat',
    createdAt: hoursAgo(0.4),
    updatedAt: hoursAgo(0.3),
    messages: [
      msg('user', '消融实验是什么？', hoursAgo(0.4)),
      msg('assistant', ABLATION_ARTICLE, hoursAgo(0.3)),
    ],
  },
  {
    id: 'ses_window',
    title: '把上下文窗口设置成 272k 并自动压缩',
    projectId: 'proj_web',
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(1),
    messages: [
      msg('user', 'codex 的上下文窗口想要设置成 272k，然后自动压缩。Grok Build 里怎么配？', hoursAgo(2)),
      msg(
        'assistant',
        'Grok Build 的会话压缩走 `/compact`，上下文长度由当前模型窗口决定，不能在前端硬写成 272k。\n\n可以在 `~/.grok/config.toml` 里设默认模型，需要更长窗口时切到对应的 Grok 模型。前端这块目前只是 UI MVP，接上 `grok agent` 之后会把模型与压缩状态显示在这条会话里。',
        hoursAgo(1.8),
      ),
      msg('user', '那 compact 会不会把关键上下文丢掉？', hoursAgo(1.2)),
      msg(
        'assistant',
        '不会整段抹掉。压缩会先写一份会话摘要，最近几轮和你钉住的文件还留在窗口里。\n\n真要保住某段，压缩前把它写进 `AGENTS.md`，或先 `/rename` 标成这条会话的主题。',
        hoursAgo(1),
      ),
    ],
  },
  {
    id: 'ses_slow',
    title: '为什么有时候 Grok 会突然变慢',
    projectId: 'proj_hello',
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(4),
    messages: [
      msg('user', '为什么有时候我的 Grok 用起来非常慢？', hoursAgo(5)),
      msg(
        'assistant',
        '常见原因就三类：模型本身排队、工具调用在等本机命令、以及会话过长触发压缩。\n\n先看状态栏有没有工具在跑；如果只是纯对话也慢，切到 Grok 4.6 或新开一场会话通常会立刻轻很多。',
        hoursAgo(4.9),
      ),
    ],
  },
  {
    id: 'ses_plot',
    title: '学术文章作图常用什么代码库',
    projectId: 'proj_wechat',
    createdAt: hoursAgo(10),
    updatedAt: hoursAgo(9),
    messages: [
      msg('user', '学术文章作图常用什么代码库？MATLAB 和 Python 怎么选？', hoursAgo(10)),
      msg(
        'tool',
        '',
        hoursAgo(9.95),
        { name: 'read_file', target: 'drafts/作图笔记.md', status: 'success' },
      ),
      msg(
        'assistant',
        'Python 侧论文图几乎都是 **Matplotlib + seaborn**，三维或科学网格用 **PyVista / Plotly**；MATLAB 更适合已有工具箱的数值实验。\n\n公众号文章如果要可复现，建议 Python：代码短、导出 SVG 方便、和 Jupyter 一起用。需要我按你下一篇的主题出一套默认样式吗？',
        hoursAgo(9.8),
      ),
    ],
  },
  {
    id: 'ses_math',
    title: '为数学建模竞赛提前准备仓库结构',
    projectId: 'proj_wechat',
    createdAt: hoursAgo(26),
    updatedAt: hoursAgo(25),
    messages: [
      msg('user', '为了准备即将到来的数学建模竞赛，我可以提前把仓库搭成什么样？', hoursAgo(26)),
      msg(
        'assistant',
        '建议按 `data / notebooks / src / paper / figures` 五段切，根目录只留 README 和 `requirements.txt`。论文正文与代码分开，图统一从 `figures/` 引用，避免最后一夜在 Word 里找图。',
        hoursAgo(25.5),
      ),
    ],
  },
  {
    id: 'ses_bubble',
    title: '冒泡排序的时间复杂度要怎么分析',
    projectId: 'proj_hello',
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(29),
    messages: [
      msg('user', '冒泡排序的时间复杂度要怎么进行分析？', hoursAgo(30)),
      msg(
        'assistant',
        '最坏和平均都是 Θ(n²)：外层 n-1 趟，第 i 趟最多比较 n-i 次。最好情况（已排序且有提前退出）是 Θ(n)。写证明时把比较次数写成求和 `∑_{i=1}^{n-1} i = n(n-1)/2` 即可。',
        hoursAgo(29.8),
      ),
    ],
  },
  {
    id: 'ses_git',
    title: '解释 Git CONTRIBUTING',
    projectId: 'proj_obsidian',
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(47),
    messages: [
      msg('user', '解释 Git CONTRIBUTING 这份文件通常要写什么。', hoursAgo(48)),
      msg(
        'assistant',
        'CONTRIBUTING 是给外部贡献者的说明书：怎么开 issue、分支命名、commit 规范、测试怎么跑、PR 要带什么。它不是许可证，也不替代 README。',
        hoursAgo(47.5),
      ),
    ],
  },
]

export const SEED_ACTIVE_PROJECT = 'proj_wechat'
