import assert from 'node:assert/strict'
import test from 'node:test'
import { fileManagerName, isApplePlatform, modKeyLabel } from '../src/lib/platform.ts'

test('modKeyLabel and file manager name follow the host platform', () => {
  assert.equal(isApplePlatform('MacIntel'), true)
  assert.equal(modKeyLabel('MacIntel'), '⌘')
  assert.equal(fileManagerName('MacIntel'), 'Finder')
  assert.equal(modKeyLabel('Win32'), 'Ctrl')
  assert.equal(fileManagerName('Win32'), '资源管理器')
  assert.equal(fileManagerName('Linux x86_64'), '文件管理器')
})
