/**
 * ShellCard: 完全自定义的 bash/pwsh 命令卡片（展开后内容）。
 *
 *
 * 结构（参考 ReadBlock：head + 单个 body，这里 head + 两个 body）：
 *
 *   head
 *     ├─ 状态（StateDot；状态文字仅读屏可见，对齐官方"正常即沉默"）
 *     ├─ cwd（子目录名）
 *     ├─ 异常 pill（仅失败/信号/错误：红色 退出码 N / 信号 X，官方同款）
 *     └─ 分割按钮（复制命令 | 复制输出）——两个 icon button
 *   body1（命令区，无标签文字）
 *     └─ 带行号的命令行（行号右对齐，位数对齐；>9 行时宽度自适应）
 *   body2（输出区，无标签文字）
 *     └─ 与原始方案一致：white-space: pre，不换行，横向滚动
 */
import { useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { terminalCardModel, writeClipboard, type TerminalCardModel, type TerminalCardStatus } from './terminal-card-model.ts'
import { IconCopyCommand, IconCopyOutput } from './icons.tsx'
import css from './ShellCard.module.css'

/**
 * 状态 → StateDot 语义 + 读屏文案 + 可见异常 pill。
 *
 * 对齐官方 TerminalBlock 的表达行为（"正常即沉默，异常才发声"）：
 * - 状态文字永远只给读屏（stateLabel 为 sr-only），任何状态都不显示可见文字；
 * - 可见信息只有异常 pill：失败 → `退出码 N`，信号终止 → `信号 X`（官方
 *   Zu() 同款，同为 error 红色）；工具错误 → `错误: code`；
 * - 运行中/成功 → 无任何可见状态文字（官方 Df() 的 done/ongoing 也只渲染 sr-only）。
 */
function statusMeta(status: TerminalCardStatus, en: boolean): {
  dot: StateDotState
  /** 读屏文案（sr-only，不可见）。 */
  label: string
  /** 可见异常信息（仅异常状态有）。 */
  pill?: string
} {
  switch (status.kind) {
    case 'running': return { dot: 'ongoing', label: en ? 'Running' : '运行中' }
    case 'done': return { dot: 'done', label: en ? 'Done' : '已完成' }
    case 'failed': return { dot: 'error', label: en ? 'Failed' : '失败', pill: en ? `exit ${status.exitCode}` : `退出码 ${status.exitCode}` }
    case 'signaled': return { dot: 'error', label: en ? 'Failed' : '失败', pill: en ? `Signal ${status.signal}` : `信号 ${status.signal}` }
    case 'interrupted': return { dot: 'warning', label: en ? 'Interrupted' : '已中断' }
    case 'error': return { dot: 'error', label: en ? 'Failed' : '失败', pill: en ? `Error: ${status.code}` : `错误: ${status.code}` }
    case 'non-terminal': return { dot: 'done', label: en ? 'Done' : '已完成' }
  }
}

/**
 * Prompt label for a working directory: `~` for the home directory itself,
 * otherwise the path's last segment (both separators accepted, trailing
 * separators ignored), falling back to the path itself when it has no segment.
 * 与官方 TerminalBlock 的 promptLabel 完全一致——cwd 显示为子目录名而非全路径。
 */
function promptLabel(cwd: string): string {
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const segment = trimmed.split(/[/\\]/).pop()
  return segment === undefined || segment === '' ? cwd : segment
}

/** 拆分命令行，带行号（位数对齐：行号右对齐，宽度随最大位数）。 */
function CommandBody({ command }: { command: string }) {
  const lines = command === '' ? [''] : command.split('\n')
  const width = String(lines.length).length
  return (
    <div className={css.commandBody}>
      {lines.map((line, i) => (
        <div key={i} className={css.commandRow}>
          <span className={css.lineNo} style={{ width: `${width}ch` }}>{i + 1}</span>
          <span className={css.lineText}>{line}</span>
        </div>
      ))}
    </div>
  )
}

export function ShellCard({ block, cwd }: { block: unknown; cwd?: string }) {
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [copiedOut, setCopiedOut] = useState(false)
  const en = typeof document !== 'undefined' && (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0

  const model = terminalCardModel(block as any, cwd)
  const meta = statusMeta(model.status, en)
  const copyCmdLabel = en ? 'Copy command' : '复制命令'
  const copyOutLabel = en ? 'Copy output' : '复制输出'

  const onCopyCmd = () => {
    if (copiedCmd) return
    void writeClipboard(model.command).then(ok => {
      if (!ok) return
      setCopiedCmd(true)
      window.setTimeout(() => setCopiedCmd(false), 1200)
    })
  }
  const onCopyOut = () => {
    if (copiedOut) return
    void writeClipboard(model.output ?? '').then(ok => {
      if (!ok) return
      setCopiedOut(true)
      window.setTimeout(() => setCopiedOut(false), 1200)
    })
  }

  return (
    <div className={css.card} data-status={model.status.kind}>
      {/* HEAD：状态点(sr-only 文案) + cwd + 复制按钮 + 异常 pill（对齐官方：
          正常状态无可见文字，仅失败/信号/错误显示红色异常信息） */}
      <div className={css.head}>
        <span className={css.stateWrap}>
          <StateDot state={meta.dot} />
          <span className={css.stateLabel}>{meta.label}</span>
        </span>
        <span className={css.cwd}>{model.cwd ? promptLabel(model.cwd) : ''}</span>
        <span className={css.spacer} />
        {meta.pill !== undefined && <span className={css.statusPill}>{meta.pill}</span>}
        <div className={css.split}>
          <button
            type="button"
            className={css.splitBtn}
            title={copyCmdLabel}
            aria-label={copyCmdLabel}
            disabled={!model.copyable}
            onClick={onCopyCmd}
          >
            <IconCopyCommand size={20} />
          </button>
          <span className={css.splitDivider} aria-hidden />
          <button
            type="button"
            className={css.splitBtn}
            title={copyOutLabel}
            aria-label={copyOutLabel}
            disabled={model.output === undefined || model.output === ''}
            onClick={onCopyOut}
          >
            <IconCopyOutput size={20} />
          </button>
        </div>
      </div>

      {/* BODY1：命令（带行号，自动换行）——无标签文字 */}
      <div className={css.body}>
        <CommandBody command={model.command} />
      </div>

      {/* BODY2：输出（pre 不换行，横向滚动）——无标签文字 */}
      {model.output !== undefined && model.output !== '' && (
        <div className={css.body}>
          <div className={css.output}>
            {model.output}
          </div>
        </div>
      )}
    </div>
  )
}