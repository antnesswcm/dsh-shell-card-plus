// host 半边 stub。本包的真正逻辑全在 client 半边（lib/client.js，React 渲染的
// 增强终端卡片）。这里的 apply 为空：patch 行存在只是为了激活包、让
// dsh-client-modules 按 dsh.client 声明把 client bundle 收集进 window.__DSH_BOOT__。
export const name = 'shell-card-plus'

export function apply() {}
