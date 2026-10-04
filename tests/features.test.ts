// 新功能的回归测试：计划 / 回合用量、审查写操作、@ 文件搜索、diff、导出。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { findFiles } from '../server/fs.ts'
import {
  assertRepoFile,
  gitChanges,
  gitCommit,
  gitDiscard,
  gitStage,
  gitUnstage,
} from '../server/git.ts'
import { mcpAddArgs } from '../server/mcp.ts'
import { TranscriptBuilder, updateToEvent } from '../server/transcript.ts'
import { lineDiff, diffStats } from '../src/lib/diff.ts'
import { sessionToMarkdown, safeFileName } from '../src/lib/export.ts'
import { initialState, reducer } from '../src/workspace-state.ts'

describe('transcript：plan / turn_completed', () => {
  it('plan 映射成清单，未知状态当 pending', () => {
    const ev = updateToEvent({
      sessionUpdate: 'plan',
      entries: [
        { content: 'a', status: 'completed', priority: 'high' },
        { content: 'b', status: 'in_progress' },
        { content: 'c', status: 'weird' },
      ],
    })
    assert.deepEqual(ev, {
      type: 'plan',
      entries: [
        { content: 'a', status: 'completed', priority: 'high' },
        { content: 'b', status: 'in_progress', priority: undefined },
        { content: 'c', status: 'pending', priority: undefined },
      ],
    })
  })

  it('turn_completed 的用量只挂到本轮最后一段助手回复', () => {
    const b = new TranscriptBuilder()
    b.applyUpdate({ sessionUpdate: 'user_message_chunk', content: { text: 'q1' } })
    b.applyUpdate({ sessionUpdate: 'agent_message_chunk', content: { text: 'a1' } })
    b.applyUpdate({ sessionUpdate: 'user_message_chunk', content: { text: 'q2' } })
    b.applyUpdate({ sessionUpdate: 'tool_call', toolCallId: 't', title: 'x' })
    // 第二轮只有工具、没有文字回复：用量不能落到第一轮的 a1 上
    b.applyUpdate({
      sessionUpdate: 'turn_completed',
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      elapsed_ms: 500,
    })
    assert.equal(b.messages[1].usage, undefined)
    b.applyUpdate({ sessionUpdate: 'agent_message_chunk', content: { text: 'a2' } })
    b.applyUpdate({
      sessionUpdate: 'turn_completed',
      usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
      elapsed_ms: 100,
    })
    const a2 = b.messages[b.messages.length - 1]
    assert.equal(a2.content, 'a2')
    assert.equal(a2.usage?.input, 5)
    assert.equal(a2.usage?.elapsedMs, 100)
  })

  it('载入时按 promptIndex 把磁盘上的用量补到对应回合', () => {
    const b = new TranscriptBuilder()
    for (const [kind, text] of [
      ['user_message_chunk', 'q0'],
      ['agent_message_chunk', 'a0'],
      ['user_message_chunk', 'q1'],
      ['agent_message_chunk', 'a1'],
    ] as const) {
      b.applyUpdate({ sessionUpdate: kind, content: { text } })
    }
    const u = (n: number) => ({ input: n, output: 0, cached: 0, reasoning: 0, total: n, calls: 1, elapsedMs: 0 })
    b.applyExtras({ usageByPrompt: new Map([[1, u(7)]]), plan: [{ content: 'p', status: 'completed' }] })
    assert.equal(b.messages[1].usage, undefined)
    assert.equal(b.messages[3].usage?.input, 7)
    assert.equal(b.plan[0].content, 'p')
  })

  it('reducer 把 plan / turn 事件写进会话', () => {
    const s0 = initialState()
    const sid = s0.activeSessionId!
    const s1 = [
      { type: 'send', text: 'q', sessionId: sid },
      { type: 'stream', sessionId: sid, event: { type: 'text', text: 'hi' } },
      { type: 'stream', sessionId: sid, event: { type: 'plan', entries: [{ content: 'x', status: 'pending' }] } },
      {
        type: 'stream',
        sessionId: sid,
        event: {
          type: 'turn',
          stopReason: 'end_turn',
          usage: { input: 1, output: 2, cached: 0, reasoning: 0, total: 3, calls: 1, elapsedMs: 9 },
        },
      },
    ].reduce((s, a) => reducer(s, a as Parameters<typeof reducer>[1]), s0)
    const session = s1.sessions.find((s) => s.id === sid)!
    assert.equal(session.plan?.[0].content, 'x')
    assert.equal(session.messages[1].usage?.total, 3)
  })
})

describe('审查：仓库内路径校验', () => {
  const root = process.platform === 'win32' ? 'C:\\repo' : '/repo'
  it('拒绝选项、绝对路径、越界', () => {
    assert.throws(() => assertRepoFile(root, '-f'))
    assert.throws(() => assertRepoFile(root, '--force'))
    assert.throws(() => assertRepoFile(root, '../etc/passwd'))
    assert.throws(() => assertRepoFile(root, 'C:\\Windows\\x'))
    assert.throws(() => assertRepoFile(root, '/etc/passwd'))
    assert.throws(() => assertRepoFile(root, 'a\nb'))
    assert.throws(() => assertRepoFile(root, ''))
  })
  it('接受普通相对路径（反斜杠转正斜杠）', () => {
    assert.equal(assertRepoFile(root, 'src\\a.ts'), 'src/a.ts')
    assert.equal(assertRepoFile(root, 'dir/-weird.txt'), 'dir/-weird.txt')
  })
})

const tmpDirs: string[] = []
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gbw-git-'))
  tmpDirs.push(dir)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(dir, 'tracked.txt'), 'one\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  return dir
}

describe('审查：暂存 / 撤销 / 提交（临时仓库）', () => {
  it('暂存、取消暂存、提交', async () => {
    const dir = tempRepo()
    writeFileSync(join(dir, 'tracked.txt'), 'two\n')
    writeFileSync(join(dir, 'new.txt'), 'n\n')
    await gitStage(dir, 'tracked.txt')
    let ch = await gitChanges(dir)
    const tracked = ch.files.find((f) => f.path === 'tracked.txt')!
    assert.equal(tracked.staged, true)
    assert.equal(tracked.unstaged, false)
    assert.equal(ch.files.find((f) => f.path === 'new.txt')!.staged, false)

    await gitUnstage(dir, 'tracked.txt')
    ch = await gitChanges(dir)
    assert.equal(ch.files.find((f) => f.path === 'tracked.txt')!.staged, false)

    await assert.rejects(gitCommit(dir, 'nothing staged'), /没有已暂存/)
    await gitStage(dir, null)
    await assert.rejects(gitCommit(dir, '   '), /提交说明/)
    const { sha } = await gitCommit(dir, 'feat: 中文说明 & "quotes"')
    assert.match(sha, /^[0-9a-f]{4,}$/)
    const log = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir }).toString().trim()
    assert.equal(log, 'feat: 中文说明 & "quotes"')
    assert.equal((await gitChanges(dir)).files.length, 0)
  })

  it('撤销：已跟踪恢复成 HEAD，未跟踪 / 新增直接删除', async () => {
    const dir = tempRepo()
    writeFileSync(join(dir, 'tracked.txt'), 'changed\n')
    writeFileSync(join(dir, 'untracked.txt'), 'u\n')
    writeFileSync(join(dir, 'added.txt'), 'a\n')
    await gitStage(dir, 'added.txt')
    await gitStage(dir, 'tracked.txt')

    await gitDiscard(dir, 'tracked.txt')
    assert.equal(readFileSync(join(dir, 'tracked.txt'), 'utf8'), 'one\n')
    await gitDiscard(dir, 'untracked.txt')
    assert.equal(existsSync(join(dir, 'untracked.txt')), false)
    await gitDiscard(dir, 'added.txt')
    assert.equal(existsSync(join(dir, 'added.txt')), false)
    assert.equal((await gitChanges(dir)).files.length, 0)
  })

  it('撤销拒绝越界路径', async () => {
    const dir = tempRepo()
    await assert.rejects(gitDiscard(dir, '../outside.txt'), /不在仓库内/)
  })
})

describe('@ 文件搜索', () => {
  it('按文件名优先、跳过 node_modules、支持子序列', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbw-find-'))
    tmpDirs.push(dir)
    mkdirSync(join(dir, 'src', 'lib'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(dir, 'src', 'workspace-state.ts'), '')
    writeFileSync(join(dir, 'src', 'lib', 'storage.ts'), '')
    writeFileSync(join(dir, 'node_modules', 'pkg', 'storage.ts'), '')
    writeFileSync(join(dir, 'README.md'), '')

    const exact = await findFiles(dir, 'storage')
    assert.deepEqual(exact.files, ['src/lib/storage.ts'])
    const fuzzy = await findFiles(dir, 'wsst')
    assert.deepEqual(fuzzy.files, ['src/workspace-state.ts'])
    const all = await findFiles(dir, '')
    assert.equal(all.files[0], 'README.md', '空查询时浅层文件排前面')
  })

  it('点开头的大目录（.conda）不会挤掉项目文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbw-find-'))
    tmpDirs.push(dir)
    mkdirSync(join(dir, '.conda', 'pkgs'), { recursive: true })
    for (let i = 0; i < 300; i++) writeFileSync(join(dir, '.conda', 'pkgs', `app${i}.py`), '')
    mkdirSync(join(dir, 'project'), { recursive: true })
    writeFileSync(join(dir, 'project', 'app.py'), '')
    const r = await findFiles(dir, 'app')
    assert.deepEqual(r.files, ['project/app.py'])
  })
})

describe('lineDiff', () => {
  it('逐行增删并折叠未改动的长段', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const after = before.replace('line 10', 'LINE 10') + '\nline 20'
    const d = lineDiff(before, after, 1)
    assert.deepEqual(diffStats(d), { added: 2, removed: 1 })
    assert.equal(d[0].kind, 'fold')
    assert.ok(d.some((l) => l.kind === 'del' && l.text === 'line 10'))
    assert.ok(d.some((l) => l.kind === 'add' && l.text === 'LINE 10'))
  })

  it('新建文件全部是新增', () => {
    assert.deepEqual(diffStats(lineDiff('', 'a\nb\n')), { added: 2, removed: 0 })
  })
})

describe('导出 Markdown', () => {
  it('用户消息成引用块，工具列清单', () => {
    const md = sessionToMarkdown(
      {
        id: 's',
        title: 't',
        projectId: null,
        cwd: 'C:\\w',
        createdAt: 0,
        updatedAt: 0,
        messages: [
          { id: '1', role: 'user', content: 'hello\nworld', createdAt: 0 },
          { id: '2', role: 'tool', content: '', createdAt: 0, tool: { name: 'read', target: 'a.ts', status: 'success' } },
          { id: '3', role: 'assistant', content: 'done', createdAt: 0 },
        ],
      },
      '标题',
    )
    assert.match(md, /^# 标题\n/)
    assert.match(md, /> hello\n> world/)
    assert.match(md, /- `read` a\.ts（成功）/)
    assert.match(md, /\ndone\n$/)
  })

  it('文件名去掉 Windows 非法字符', () => {
    assert.equal(safeFileName('a/b:c*?"<>|d'), 'a b c d')
    assert.equal(safeFileName('   '), '会话')
  })
})

describe('MCP：grok mcp add 参数', () => {
  it('stdio：值用 --env= 形式，命令和参数都在 -- 之后', () => {
    assert.deepEqual(
      mcpAddArgs({
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '-starts-with-dash' },
      }),
      [
        'mcp', 'add', '--scope=user', '--env=GITHUB_TOKEN=-starts-with-dash',
        'github', '--', 'npx', '-y', '@modelcontextprotocol/server-github',
      ],
    )
  })

  it('远程：带传输方式和请求头，地址放最后', () => {
    assert.deepEqual(
      mcpAddArgs({
        name: 'api',
        scope: 'project',
        transport: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer x' },
      }),
      ['mcp', 'add', '--scope=project', '--transport=http', '--header=Authorization: Bearer x', 'api', 'https://mcp.example.com/mcp'],
    )
  })

  it('拒绝危险或无效输入', () => {
    const base = { scope: 'user' as const, transport: 'stdio' as const, command: 'npx' }
    assert.throws(() => mcpAddArgs({ ...base, name: '--scope' }))
    assert.throws(() => mcpAddArgs({ ...base, name: 'a b' }))
    assert.throws(() => mcpAddArgs({ ...base, name: 'ok', env: { 'BAD-KEY': 'x' } }))
    assert.throws(() => mcpAddArgs({ ...base, name: 'ok', env: { K: 'a\nb' } }))
    assert.throws(() => mcpAddArgs({ ...base, name: 'ok', command: '' }))
    assert.throws(() => mcpAddArgs({ ...base, name: 'ok', args: ['x\ny'] }))
    assert.throws(() =>
      mcpAddArgs({ name: 'r', scope: 'user', transport: 'http', url: 'file:///etc/passwd' }),
    )
    assert.throws(() =>
      mcpAddArgs({ name: 'r', scope: 'user', transport: 'sse', url: 'https://x', headers: { 'X Bad': 'v' } }),
    )
  })
})

