/**
 * ToolCallRow: 替换官方 bash/pwsh 的原子工具行（tool.call.toolview keyed slot）。
 *
 * - 折叠行：用官方 DisclosureRow（与官方 ToolRow 一致的摘要行样式），
 *   不改变折叠行的外观。
 * - 展开后：完全自定义的 ShellCard（head + 2 body）。
 */
import { useState } from 'react'
import { DisclosureRow, IconApiOutline14, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool'
import type { ReactNode } from 'react'
import { terminalCardModel, type TerminalCardStatus } from './terminal-card-model.ts'
import { ShellCard } from './ShellCard.tsx'
import css from './ToolCallRow.module.css'

/** Hot-reload 验证标记：仅 __DEV__ 时显示。改数字保存后颜色变化可验证 HMR。 */
const HOT = 7

/** 状态 → 折叠行图标：与官方 leadingFor 一致——
 *  失败（非零退出 / 信号终止 / 工具错误）= 红点，中断 = 黄点，其余 = 普通工具图标。
 *  官方 terminalFailed() 把信号终止也算失败，故 signaled 不再是黄点。 */
function leadingIconOf(status: TerminalCardStatus): ReactNode {
  switch (status.kind) {
    case 'failed':
    case 'error':
    case 'signaled': return <StateDot state="error" />
    case 'interrupted': return <StateDot state="warning" />
    default: return <IconApiOutline14 size={14} />
  }
}

/** 状态 → 折叠行状态文字。与官方 stateStatus 一致：仅读屏可见（sr-only），
 *  成功态为 null（官方注释：icon 和摘要已足以描述已结束的行，无需文字）。 */
function srStatusOf(status: TerminalCardStatus, en: boolean): string | null {
  switch (status.kind) {
    case 'running': return en ? 'Running' : '运行中'
    case 'failed':
    case 'error':
    case 'signaled': return en ? 'Failed' : '失败'
    case 'interrupted': return en ? 'Interrupted' : '已中断'
    default: return null
  }
}

export function ToolCallRow({ block, cwd, toolName }: ToolCallViewProps) {
  const [expanded, setExpanded] = useState(false)
  const en = typeof document !== 'undefined' && (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0
  const model = terminalCardModel(block, cwd)
  const title = toolName === 'pwsh' ? 'Pwsh' : 'Bash'
  const summary = model.description ? model.description.split('\n')[0] : (en ? '(no description)' : '(无描述)')
  const expandable = true
  const leadingIcon = leadingIconOf(model.status)
  const srStatus = srStatusOf(model.status, en)

  return (
    <div className={css.wrap} data-hot={__DEV__ ? HOT : undefined}>
      {__DEV__ && <div className={css.hotTag}>HOT-{HOT} | ToolCallRow</div>}
      {/* 官方同款：读屏专用状态文字（StateDot 是纯颜色信号，读屏不可见） */}
      {srStatus !== null && <span className={css.srOnly}>{srStatus}</span>}
      <DisclosureRow
        icon={leadingIcon}
        title={title}
        open={expanded}
        expandable={expandable}
        expandOnRowClick
        onToggle={() => setExpanded(v => !v)}
        collapsedContent={<span className={css.summary}>{summary}</span>}
      >
        <ShellCard block={block} cwd={cwd} />
      </DisclosureRow>
    </div>
  )
}