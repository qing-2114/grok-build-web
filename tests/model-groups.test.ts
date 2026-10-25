import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentModel } from '../src/lib/agent.ts'
import { BUILTIN_GROUP_ID, groupIdOf, groupModels } from '../src/lib/model-groups.ts'

const models: AgentModel[] = [
  { id: 'grok-4.6', label: 'Grok 4.6', efforts: ['high'] },
  { id: 'cb-grok-4.7', label: 'grok-4.7', efforts: ['high'], provider: { id: 'cb', name: 'cloudborne' } },
  { id: 'grok-4.5', label: 'Grok 4.5', efforts: ['low'] },
  { id: 'lite-glm', label: 'glm-5.3', efforts: [], provider: { id: 'lite', name: 'litemodel' } },
  { id: 'cb-grok-4.6', label: 'grok-4.6', efforts: ['high'], provider: { id: 'cb', name: 'cloudborne' } },
]

describe('groupModels', () => {
  it('内置模型排第一组，自定义供应商按出现顺序分组', () => {
    const groups = groupModels(models)
    assert.deepEqual(
      groups.map((g) => [g.id, g.name, g.custom, g.models.map((m) => m.id)]),
      [
        [BUILTIN_GROUP_ID, 'Grok Build', false, ['grok-4.6', 'grok-4.5']],
        ['cb', 'cloudborne', true, ['cb-grok-4.7', 'cb-grok-4.6']],
        ['lite', 'litemodel', true, ['lite-glm']],
      ],
    )
  })

  it('没有内置模型时不出空的内置组', () => {
    const groups = groupModels(models.filter((m) => m.provider))
    assert.equal(groups[0].id, 'cb')
    assert.equal(groups.length, 2)
  })

  it('groupIdOf 找当前模型所在组，找不到退回第一组', () => {
    const groups = groupModels(models)
    assert.equal(groupIdOf(groups, 'lite-glm'), 'lite')
    assert.equal(groupIdOf(groups, 'grok-4.5'), BUILTIN_GROUP_ID)
    assert.equal(groupIdOf(groups, 'missing'), BUILTIN_GROUP_ID)
    assert.equal(groupIdOf([], 'missing'), BUILTIN_GROUP_ID)
  })
})
