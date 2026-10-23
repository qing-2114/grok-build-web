import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

function selectionBackground(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? (/background:\s*([^;]+);/.exec(m[1])?.[1].trim() ?? null) : null
}

describe('文字选区', () => {
  it('深色主题有选区底色', () => {
    assert.ok(selectionBackground('::selection'))
  })

  it('浅色主题的选区不是白色（否则在白底上看不见）', () => {
    const bg = selectionBackground(":root[data-theme='light'] ::selection")
    assert.ok(bg, '缺少浅色主题的 ::selection')
    assert.doesNotMatch(bg, /rgba?\(\s*255\s*,\s*255\s*,\s*255/)
    assert.doesNotMatch(bg, /#fff/i)
  })

  it('对话正文、用户消息和输入框允许鼠标选中', () => {
    assert.match(css, /\.doc-turn \.prose,\s*\.follow-prompt-text,\s*\.composer-box textarea\s*\{\s*user-select: text;/)
  })
})
