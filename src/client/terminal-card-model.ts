/**
 * terminal-card-model.ts
 *
 * 从 @deepseek-ai/dsh-client-ui-tool 复制（官方 ui-tool 的 models/terminal-card-model.ts）
 * 的纯逻辑 + 我们自己的扩展。
 *
 * 核心：从 frozen ToolCallBlock 派生终端卡片的展示状态矩阵。覆盖所有状态：
 *   运行中 / 成功 / 失败(非零退出) / 信号终止 / 中断 / 工具错误 / 非终端
 */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** 终端卡片展示状态：由 block 派生。 */
export type TerminalCardStatus =
  | { kind: 'running' }                     // 运行中
  | { kind: 'done' }                        // 成功完成（exit 0，无 signal）
  | { kind: 'failed'; exitCode: number }    // 非零退出码
  | { kind: 'signaled'; signal: string }    // 被信号终止
  | { kind: 'interrupted' }                 // 中断（turn/step 关闭，无 result）
  | { kind: 'error'; code: string }         // 工具调用本身出错
  | { kind: 'non-terminal' }                // 非终端意图（generic 兜底）

export interface TerminalCardModel {
  status: TerminalCardStatus
  command: string
  cwd?: string
  output?: string
  description?: string
  /** 是否仍可复制命令（非空即有）。 */
  copyable: boolean
}

/** 写剪贴板：优先 Clipboard API，降级 execCommand。 */
export async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** 终端卡片的标签组（官方同款，本地化）。 */
export function terminalBlockLabels(en: boolean): TerminalBlockLabels {
  return {
    signal: s => en ? `signal ${s}` : `信号 ${s}`,
    exitCode: c => en ? `exit ${c}` : `退出码 ${c}`,
    running: en ? 'Running' : '运行中',
    failed: en ? 'Failed' : '失败',
    done: en ? 'Done' : '已完成',
    copy: en ? 'Copy' : '复制',
    copied: en ? 'Copied' : '复制成功',
    noOutput: en ? 'No output' : '无输出',
    collapseAria: en ? 'Collapse output' : '收起输出',
    collapse: en ? 'Collapse' : '收起',
    expandAria: hidden => en ? `Show remaining ${hidden} lines` : `展开其余 ${hidden} 行输出`,
    expand: hidden => en ? `… ${hidden} more lines` : `… 其余 ${hidden} 行`,
  }
}

// ── cwd 解析（官方同构）───────────────────────────────────────────────────

function collapse(body: string, rooted: boolean, separator = '/'): string {
  const kept: string[] = []
  for (const segment of body.split(/[/\\]/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (kept.length > 0 && kept[kept.length - 1] !== '..') kept.pop()
      else if (!rooted) kept.push(segment)
      continue
    }
    kept.push(segment)
  }
  return kept.join(separator)
}

function normalizeSegments(path: string): string {
  if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path
  const unc = /^[/\\]{2}([^/\\]+)[/\\]+([^/\\]+)/.exec(path)
  if (unc !== null) {
    const [matched, server, share] = unc
    const root = `\\\\${String(server)}\\${String(share)}`
    const rest = collapse(path.slice(matched.length), true)
    return rest === '' ? root : `${root}\\${rest}`
  }
  const backslashed = path.includes('\\') && !path.includes('/')
  const separator = backslashed ? '\\' : '/'
  const rooted = /^[/\\]/.test(path)
  const drive = /^[A-Za-z]:/.exec(path)?.[0] ?? ''
  const body = collapse(path.slice(drive.length), rooted || drive !== '', separator)
  const leading = rooted ? separator : ''
  return drive === '' ? `${leading}${body}` : `${drive}${rooted ? leading : separator}${body}`
}

function resolveTerminalCwd(viewCwd: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (viewCwd === undefined || viewCwd === '') return sessionCwd
  if (sessionCwd === undefined || sessionCwd === '') return normalizeSegments(viewCwd)
  const joined = sessionCwd.replace(/[/\\]+$/, '') + '/' + viewCwd
  return normalizeSegments(joined)
}

// ── 主派生：状态矩阵 ──────────────────────────────────────────────────────

export function terminalCardModel(block: ToolCallBlock, sessionCwd?: string): TerminalCardModel {
  const call = block.callView?.card === 'terminal' ? block.callView : null
  const callCwd = call === null ? undefined : resolveTerminalCwd(call.cwd, sessionCwd)
  const command = call?.title ?? ''

  // 运行中：只有 callView，无 result
  if (!('kind' in block)) {
    return {
      status: { kind: 'running' },
      command,
      cwd: callCwd,
      description: call?.description,
      copyable: command !== '',
    }
  }

  // 已结束：有 resultView
  // 工具调用本身出错（error 字段）
  if (block.error !== undefined) {
    return {
      status: { kind: 'error', code: block.error.code },
      command,
      cwd: callCwd,
      output: block.content?.map(c => c.type === 'text' ? c.text : '').join('\n'),
      description: call?.description,
      copyable: command !== '',
    }
  }

  // 中断（合成块：isError + Interrupted，无 output）
  if (block.isError && block.error?.code === 'interrupted') {
    return {
      status: { kind: 'interrupted' },
      command,
      cwd: callCwd,
      output: undefined,
      description: call?.description,
      copyable: command !== '',
    }
  }

  // 非终端意图（resultView.card 不是 terminal）
  const result = block.resultView?.card === 'terminal' ? block.resultView : null
  if (result === null) {
    // 尝试从 content 提取文本作输出
    const output = block.content?.map(c => c.type === 'text' ? c.text : '').join('\n')
    return {
      status: { kind: 'non-terminal' },
      command,
      cwd: callCwd,
      output,
      description: call?.description,
      copyable: command !== '',
    }
  }

  // 正常终端结果：signal / exitCode 决定状态
  const resultCwd = call === null ? undefined : callCwd
  const finalCommand = result.title ?? command
  if (result.signal !== undefined) {
    return {
      status: { kind: 'signaled', signal: result.signal },
      command: finalCommand,
      cwd: resultCwd,
      output: result.output,
      description: call?.description,
      copyable: finalCommand !== '',
    }
  }
  if (result.exitCode !== undefined && result.exitCode !== 0) {
    return {
      status: { kind: 'failed', exitCode: result.exitCode },
      command: finalCommand,
      cwd: resultCwd,
      output: result.output,
      description: call?.description,
      copyable: finalCommand !== '',
    }
  }
  return {
    status: { kind: 'done' },
    command: finalCommand,
    cwd: resultCwd,
    output: result.output,
    description: call?.description,
    copyable: finalCommand !== '',
  }
}