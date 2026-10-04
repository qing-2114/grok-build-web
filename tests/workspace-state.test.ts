// reducer 回归测试：BUG-01 / BUG-02 / BUG-03 修过的状态机路径，以及
// ChatPane memo 依赖的「流式只换最后一条消息对象」这个不变量。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampEffort,
  initialState,
  reducer,
  type Action,
  type WorkspaceState,
} from '../src/workspace-state.ts'
import type { Message, Project, Session } from '../src/types.ts'

const project: Project = {
  id: 'proj-a',
  name: 'alpha',
  path: 'C:\\work\\alpha',
  branch: '',
  branches: [],
}

function base(): WorkspaceState {
  const s = initialState()
  return {
    ...s,
    projects: [project],
    activeProjectId: project.id,
    homeDir: 'C:\\Users\\me',
    connection: 'connected',
  }
}

function run(state: WorkspaceState, ...actions: Action[]): WorkspaceState {
  return actions.reduce(reducer, state)
}

function active(state: WorkspaceState): Session {
  const s = state.sessions.find((x) => x.id === state.activeSessionId)
  assert.ok(s, 'activeSessionId must point at an existing session')
  return s
}

const GROK_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('send + bind-remote（BUG-01）', () => {
  it('发送后草稿立刻有用户消息并进入生成中', () => {
    const s0 = base()
    const draftId = s0.activeSessionId!
    const s1 = run(s0, { type: 'send', text: '  hello  ', sessionId: draftId })
    const msgs = active(s1).messages
    assert.equal(msgs.length, 1)
    assert.equal(msgs[0].role, 'user')
    assert.equal(msgs[0].content, 'hello')
    assert.deepEqual(s1.thinkingIds, [draftId])
  })

  it('空文本且无图片不改状态', () => {
    const s0 = base()
    assert.equal(run(s0, { type: 'send', text: '   ' }), s0)
  })

  it('bind-remote 把草稿换成 grok id，活动会话、生成中、等候队列一起跟过去', () => {
    const s0 = base()
    const draftId = s0.activeSessionId!
    const s1 = run(
      s0,
      { type: 'send', text: 'hi', sessionId: draftId },
      { type: 'enqueue', item: { id: 'q1', sessionId: draftId, text: 'next' } },
      {
        type: 'bind-remote',
        localId: draftId,
        sessionId: GROK_ID,
        cwd: project.path,
        projectId: project.id,
      },
    )
    assert.equal(s1.activeSessionId, GROK_ID)
    assert.equal(active(s1).source, 'grok')
    assert.equal(active(s1).messages.length, 1)
    assert.deepEqual(s1.thinkingIds, [GROK_ID])
    assert.equal(s1.outgoingQueue[0].sessionId, GROK_ID)
    assert.ok(!s1.sessions.some((s) => s.id === draftId))
  })

  it('创建远端会话期间用户新开了草稿，绑定后不抢走当前视图', () => {
    const s0 = base()
    const draftId = s0.activeSessionId!
    const s1 = run(
      s0,
      { type: 'send', text: 'hi', sessionId: draftId },
      { type: 'new-chat', projectId: null },
    )
    const otherDraft = s1.activeSessionId!
    assert.notEqual(otherDraft, draftId)
    const s2 = run(s1, {
      type: 'bind-remote',
      localId: draftId,
      sessionId: GROK_ID,
      cwd: project.path,
      projectId: project.id,
    })
    assert.equal(s2.activeSessionId, otherDraft)
    assert.ok(s2.sessions.some((s) => s.id === otherDraft))
    assert.ok(s2.sessions.some((s) => s.id === GROK_ID))
  })
})

describe('hydrate-session（BUG-02）', () => {
  it('载入期间已经写进去的消息不会被远端历史覆盖', () => {
    const remote: Session = {
      id: GROK_ID,
      title: 'remote',
      projectId: null,
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      source: 'grok',
    }
    const s0 = { ...base(), sessions: [remote], activeSessionId: GROK_ID }
    const s1 = run(
      s0,
      { type: 'set-hydrating', id: GROK_ID },
      { type: 'send', text: 'typed while loading', sessionId: GROK_ID },
    )
    const loaded: Message[] = [
      { id: 'old', role: 'user', content: 'old', createdAt: 0 },
    ]
    const s2 = run(s1, {
      type: 'hydrate-session',
      sessionId: GROK_ID,
      messages: loaded,
    })
    assert.equal(s2.hydratingId, null)
    assert.equal(active(s2).messages.length, 1)
    assert.equal(active(s2).messages[0].content, 'typed while loading')
  })
})

describe('stream', () => {
  it('文本增量拼到最后一条助手消息，前面的消息对象保持同一引用', () => {
    const s0 = base()
    const sid = s0.activeSessionId!
    const s1 = run(
      s0,
      { type: 'send', text: 'q', sessionId: sid },
      { type: 'stream', sessionId: sid, event: { type: 'text', text: 'Hel' } },
    )
    const before = active(s1).messages
    const s2 = run(s1, {
      type: 'stream',
      sessionId: sid,
      event: { type: 'text', text: 'lo' },
    })
    const after = active(s2).messages
    assert.equal(after.length, 2)
    assert.equal(after[1].content, 'Hello')
    assert.equal(after[0], before[0], '用户消息对象不应被复制（ChatPane memo 依赖它）')
    assert.notEqual(after[1], before[1])
  })

  it('工具事件按 id 原地更新状态', () => {
    const s0 = base()
    const sid = s0.activeSessionId!
    const tool = (status: 'running' | 'success') =>
      ({
        type: 'stream',
        sessionId: sid,
        event: { type: 'tool', id: 't1', name: 'edit', target: 'a.ts', status },
      }) as const
    const s1 = run(s0, { type: 'send', text: 'q', sessionId: sid }, tool('running'), tool('success'))
    const tools = active(s1).messages.filter((m) => m.role === 'tool')
    assert.equal(tools.length, 1)
    assert.equal(tools[0].tool?.status, 'success')
  })

  it('手动重命名后忽略 agent 推来的标题', () => {
    const s0 = base()
    const sid = s0.activeSessionId!
    const s1 = run(
      s0,
      { type: 'rename-session', id: sid, title: 'mine' },
      { type: 'stream', sessionId: sid, event: { type: 'title', title: 'auto' } },
    )
    assert.equal(s1.titleOverrides[sid], 'mine')
    assert.notEqual(active(s1).title, 'auto')
  })
})

describe('等候队列（BUG-03）', () => {
  it('enqueue / remap / dequeue', () => {
    const s0 = base()
    const s1 = run(
      s0,
      { type: 'enqueue', item: { id: 'a', sessionId: 'x', text: '1' } },
      { type: 'enqueue', item: { id: 'b', sessionId: 'y', text: '2' } },
      { type: 'remap-queue', from: 'x', to: 'z' },
      { type: 'dequeue', id: 'b' },
    )
    assert.deepEqual(
      s1.outgoingQueue.map((q) => [q.id, q.sessionId]),
      [['a', 'z']],
    )
  })
})

describe('delete-project', () => {
  function withProjectChat(): WorkspaceState {
    const s0 = base()
    const sid = s0.activeSessionId!
    return run(
      s0,
      { type: 'send', text: 'hi', sessionId: sid },
      {
        type: 'bind-remote',
        localId: sid,
        sessionId: GROK_ID,
        cwd: project.path,
        projectId: project.id,
      },
      { type: 'thinking', sessionId: GROK_ID, on: false },
    )
  }

  it('不删会话：会话留下并落到「最近」', () => {
    const s1 = run(withProjectChat(), {
      type: 'delete-project',
      id: project.id,
      deleteChats: false,
    })
    assert.equal(s1.projects.length, 0)
    const kept = s1.sessions.find((s) => s.id === GROK_ID)
    assert.ok(kept)
    assert.equal(kept.projectId, null)
  })

  it('连会话一起删：活动会话换成主目录草稿', () => {
    const s1 = run(withProjectChat(), {
      type: 'delete-project',
      id: project.id,
      deleteChats: true,
    })
    assert.ok(!s1.sessions.some((s) => s.id === GROK_ID))
    assert.equal(active(s1).cwd, 'C:\\Users\\me')
    assert.equal(s1.activeProjectId, null)
  })
})

describe('clampEffort', () => {
  const models = [
    { id: 'm1', name: 'm1', efforts: ['low', 'high'] as const },
    { id: 'm2', name: 'm2', efforts: ['medium'] as const },
  ].map((m) => ({ ...m, efforts: [...m.efforts] }))

  it('模型支持就保留，不支持优先退到 high，再退到第一档', () => {
    assert.equal(clampEffort('m1', 'low', models as never), 'low')
    assert.equal(clampEffort('m1', 'xhigh', models as never), 'high')
    assert.equal(clampEffort('m2', 'xhigh', models as never), 'medium')
    assert.equal(clampEffort('missing', 'low', models as never), 'high')
  })
})
