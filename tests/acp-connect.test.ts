// ACP 连接状态：只有 initialize 回包后才算「已连接」，握手中和握手失败都不能报已连接。
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { GrokAcp } from '../server/acp.ts'

const fake = fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url))
const live: GrokAcp[] = []

function agent(mode: string): GrokAcp {
  const acp = new GrokAcp(process.execPath, [fake, mode])
  live.push(acp)
  return acp
}

afterEach(() => {
  for (const acp of live.splice(0)) acp.stop()
})

describe('ACP 连接', () => {
  it('initialize 回包前不报已连接，回包后带版本号', async () => {
    const acp = agent('slow')
    const started = acp.start()
    // 进程已经起来（200ms 之后），但 initialize 还没回（600ms）
    await new Promise((r) => setTimeout(r, 350))
    assert.equal(acp.connected, false)
    assert.equal(acp.version, '')
    // 握手期间的 ensure() 等同一次握手，不会另起进程
    await Promise.all([started, acp.ensure()])
    assert.equal(acp.connected, true)
    assert.equal(acp.version, '9.9.9')
    assert.deepEqual(acp.models.map((m) => m.id), ['m1'])
  })

  it('握手中 agent 退出：不报已连接，错误里带 stderr', async () => {
    const acp = agent('exit')
    await assert.rejects(acp.start(), /login required/)
    assert.equal(acp.connected, false)
    assert.match(acp.lastError ?? '', /login required/)
  })

  it('命令不存在：报找不到 grok，之后还能重试', async () => {
    const acp = new GrokAcp('grok-build-web-no-such-command', [])
    live.push(acp)
    await assert.rejects(acp.start(), /找不到 grok 命令/)
    assert.equal(acp.connected, false)
    await assert.rejects(acp.start(), /找不到 grok 命令/)
  })

  it('掉线后 ensure() 会重新拉起', async () => {
    const acp = agent('ok')
    await acp.start()
    assert.equal(acp.connected, true)
    ;(acp as unknown as { proc: { kill: () => void } }).proc.kill()
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(acp.connected, false)
    await acp.ensure()
    assert.equal(acp.connected, true)
    assert.equal(acp.version, '9.9.9')
  })
})
