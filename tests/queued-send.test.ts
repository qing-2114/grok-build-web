import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Writable } from 'node:stream'
import { prepareQueuedSend } from '../src/lib/queued-send.ts'
import { GrokAcp } from '../server/acp.ts'

describe('立即发送', () => {
  it('先暂停生成，等待旧回合清理后才允许发送', async () => {
    let running = true
    let polls = 0
    const calls: string[] = []
    const id = await prepareQueuedSend(
      () => ({ id: 'remote', running, remote: true }),
      async (sid) => { calls.push(sid) },
      { now: () => polls, timeout: 10, sleep: async () => {
        assert.deepEqual(calls, ['remote'])
        if (++polls === 3) running = false
      } },
    )
    assert.equal(id, 'remote')
    assert.equal(polls, 3)
    assert.deepEqual(calls, ['remote'])
  })

  it('空闲会话无需暂停', async () => {
    assert.equal(await prepareQueuedSend(
      () => ({ id: 'remote', running: false, remote: true }),
      async () => { assert.fail('不应暂停') },
    ), 'remote')
  })

  it('草稿绑定后用远端 ID 暂停和发送', async () => {
    let remote = false
    let running = true
    assert.equal(await prepareQueuedSend(
      () => ({ id: remote ? 'remote' : 'draft', running, remote }),
      async (id) => { assert.equal(id, 'remote'); running = false },
      { now: () => 0, timeout: 10, sleep: async () => { remote = true } },
    ), 'remote')
  })

  it('等待期间删除或编辑队列消息，不发送旧内容', async () => {
    let removed = false
    assert.equal(await prepareQueuedSend(
      () => removed ? null : { id: 'remote', running: true, remote: true },
      async () => { removed = true },
      { now: () => 0, timeout: 10, sleep: async () => {} },
    ), null)
  })

  it('暂停失败或旧回合未结束时不允许发送', async () => {
    const read = () => ({ id: 'remote', running: true, remote: true })
    await assert.rejects(prepareQueuedSend(read, async () => {
      throw new Error('暂停失败')
    }), /暂停失败/)
    let time = 0
    await assert.rejects(prepareQueuedSend(read, async () => {}, {
      now: () => time, timeout: 2, sleep: async () => { time++ },
    }), /消息仍在等候列表/)
  })
})

describe('ACP cancel', () => {
  it('以无 id 的通知写入 stdin，不等待 agent 回包', async () => {
    const frames: string[] = []
    const acp = new GrokAcp()
    Object.assign(acp, {
      connected: true,
      proc: { stdin: new Writable({ write(chunk, _encoding, done) {
        frames.push(String(chunk))
        done()
      } }) },
    })
    await acp.notify('session/cancel', { sessionId: 'remote' })
    assert.deepEqual(frames.map((frame) => JSON.parse(frame)), [
      { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 'remote' } },
    ])
  })

  it('断线时报告失败', async () => {
    await assert.rejects(new GrokAcp().notify('session/cancel'), /未连接/)
  })
})
