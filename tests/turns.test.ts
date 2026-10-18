import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { foldBefore } from '../src/lib/turns.ts'

const msg = (role: string) => ({ role })

describe('foldBefore', () => {
  it('只有最终回复时不折叠', () => {
    const messages = [msg('user'), msg('assistant')]
    assert.equal(foldBefore(messages, 1, 2), null)
  })

  it('工具和更早的回复收在最后一段之前', () => {
    const messages = [
      msg('user'),
      msg('assistant'),
      msg('tool'),
      msg('assistant'),
    ]
    assert.equal(foldBefore(messages, 1, 4), 3)
  })

  it('最后一段后面的工具留在结果里', () => {
    const messages = [msg('assistant'), msg('tool'), msg('assistant'), msg('tool')]
    assert.equal(foldBefore(messages, 0, 4), 2)
  })

  it('只有工具、没有最终回复时不折叠', () => {
    const messages = [msg('user'), msg('tool'), msg('tool')]
    assert.equal(foldBefore(messages, 1, 3), null)
  })

  it('只看这一轮，不越过下一句用户消息', () => {
    const messages = [
      msg('assistant'),
      msg('tool'),
      msg('assistant'),
      msg('user'),
      msg('assistant'),
    ]
    assert.equal(foldBefore(messages, 0, 3), 2)
    assert.equal(foldBefore(messages, 4, 5), null)
  })
})
