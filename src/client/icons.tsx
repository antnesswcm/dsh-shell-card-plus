/**
 * icons.tsx — 图标组件（从 assets/*.svg 自动生成）。
 *
 * 构建时由 build.mjs 的 svgPlugin 把 .svg 文件包装成 React 组件：
 *   默认导出函数，接受 { size, className }，用 currentColor 填充。
 * 以后改图标只需替换 assets/ 下的 SVG 文件，无需改这里的代码。
 */
import IconCopyCommand from './assets/copy_command.svg'
import IconCopyOutput from './assets/copy_output.svg'

export { IconCopyCommand, IconCopyOutput }
