/**
 * dsh-shell-card-plus 插件入口（client 半边）。
 *
 * 注册 keyed `tool.call.toolview` 视图（key: bash / pwsh），替换官方对这两个
 * 工具的原子行渲染。官方 ToolCallTree 的 dispatch 逻辑：
 *
 *   renderSlot('tool.call.toolview', owner, { entryKey: toolName, fallback: GenericToolCard })
 *
 * 注册 key 为 'bash'/'pwsh' 后，bash/pwsh 的调用不再走 GenericToolCard 兜底，
 * 而是走我们的 ToolCallRow——折叠时显示摘要行，展开后显示 ShellCard 增强卡片。
 * 这样只有一张卡片，没有"两张卡片并存"的问题。
 *
 * 注意：我们不注册独立的 Conversation Node。如果
 * 注册了额外的 node，它会与官方 tool-call node 同时匹配同一个 tool/call 事件，
 * 导致两条 node 流同时渲染，页面出现两张卡片。因此只替换 tool view 插槽。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool'
import { ToolCallRow } from './ToolCallRow.tsx'

/** Locale namespace: 本包只用默认副本文案，沿用 conversation 词表即可。 */
const NS = 'conversation'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // 替换官方 bash/pwsh 的原子工具行：默认折叠的摘要行 + 展开后是我们的增强卡。
  // slot 是"最低 priority 渲染"的阴影机制：官方 bash-toolview-sample 已占
  // key:'bash' @ priority 0，我们用 priority:-1 阴影它（更低 = 先渲染）。
  for (const tool of ['bash', 'pwsh'] as const) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview',
      key: tool,
      priority: -1,
      locale: NS,
    }, ToolCallRow))
  }
}