import type { AgentModel } from './agent'

// 模型选择器按供应商分组：内置模型一组，模型部署里的每个自定义供应商各一组。
// 纯函数，不碰 React，`tests/` 直接测。

export const BUILTIN_GROUP_ID = ''

export type ModelGroup = {
  id: string
  name: string
  custom: boolean
  models: AgentModel[]
}

export function groupModels(models: AgentModel[]): ModelGroup[] {
  const builtin: AgentModel[] = []
  const custom = new Map<string, ModelGroup>()
  for (const m of models) {
    if (!m.provider) {
      builtin.push(m)
      continue
    }
    const group = custom.get(m.provider.id)
    if (group) group.models.push(m)
    else {
      custom.set(m.provider.id, {
        id: m.provider.id,
        name: m.provider.name || m.provider.id,
        custom: true,
        models: [m],
      })
    }
  }
  const groups = [...custom.values()]
  if (builtin.length) {
    groups.unshift({ id: BUILTIN_GROUP_ID, name: 'Grok Build', custom: false, models: builtin })
  }
  return groups
}

/** 当前模型所在的组；找不到就落到第一组。 */
export function groupIdOf(groups: ModelGroup[], modelId: string): string {
  const hit = groups.find((g) => g.models.some((m) => m.id === modelId))
  return hit?.id ?? groups[0]?.id ?? BUILTIN_GROUP_ID
}
