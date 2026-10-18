// 截图模式：只认 ?demo=1，避免把本机真实会话带进公开截图。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isDemoMode } from '../src/lib/demo.ts'

describe('demo：截图模式', () => {
  it('只认 demo=1', () => {
    assert.equal(isDemoMode('?demo=1'), true)
    assert.equal(isDemoMode('?demo=0'), false)
    assert.equal(isDemoMode(''), false)
    assert.equal(isDemoMode('?other=1'), false)
  })
})
