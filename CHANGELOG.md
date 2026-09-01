# Changelog

All notable changes to this project are documented here.

## [0.3.1] - 2026-09-01

### Fixed

- **折叠行摘要行行为对齐官方**：官方 `BashRow` 的摘要行（`Bash · 描述`）在展开后应始终保留（`keepContentWhenOpen`），此前展开后摘要行消失，已补上该 prop。
- **折叠行缺分隔圆点**：官方行结构为 `Bash · 描述`，中间有 2px 圆点（`.sep`），此前缺失，已补上。空摘要时圆点一并消失（官方同款）。
- **折叠行摘要来源错误**：此前用 `model.command` 首行作为摘要，但官方应取 `model.description`（模型描述文字）。已修正。
- **摘要错误状态优先级**：官方摘要优先级为 `failureLine ?? terminal?.description ?? model.summary`，错误态应显示错误输出首行（红色）。已对齐。
- **缺少 Inspect 按钮**：官方展开卡片下方有 Inspect 按钮（`IconInspectOutline12`），由 `ToolCallOwnerProps.inspect` 注入，此前未使用。已补上。

### Changed

- **README 痛点描述修正**：`想改命令没有入口` → `没有复制命令按钮`（更准确描述原版问题）。
- **README 添加截图对比**：`docs/preview/` 下放入原版 vs 本插件展开卡片对比截图，替换原有 TODO 占位。

### Notes

- 全部修复已通过 `dev` 分支推送远端，`main` 已同步。
- 本地 dsh 已 link 安装 dev 分支版本，重新构建后重启 dsh web 生效。
- 仓库已添加 `dsh-plugin` / `deepseek-harness` / `cordis` 三个 GitHub topic，上架准备就绪。

## [0.3.0] - 2026-08-29

### Changed (breaking)

- **更名 `dsh-terminal-plus` → `dsh-shell-card-plus`**：原名易被误解为终端模拟器；
  实际能力是**会话内的 Shell 命令卡片**（bash/pwsh 调用渲染为可折叠、可复制、
  可回看的卡片）。中文名：**Shell 命令卡片增强**。
  - 包名/entry id：`dsh-shell-card-plus` / `shell-card-plus`（`cordis.patch.yml`、
    `__ModuleLoader__` id、host stub name 同步）。
  - 展开卡组件 `TerminalPlusCard` → `ShellCard`（`ShellCard.tsx` / `ShellCard.module.css`）。
  - **升级需重装**：`dsh plugin remove` 旧包后重新 `add`，并更新 profile patch 里的
    `id`/`name`。

## [0.2.1] - 2026-08-29

### Changed

- **状态展示对齐官方 TerminalBlock 的表达行为（"正常即沉默，异常才发声"）**：
  - 展开卡头部不再显示可见的"运行中/已完成"等状态文字——状态文字与官方一致
    降为读屏专用（sr-only），眼睛只能看到 StateDot 状态点；成功卡片与官方一样
    干净（仅状态点 + cwd + 复制按钮）。
  - 新增官方同款异常 pill：失败 → 红色 `退出码 N`、信号终止 → 红色 `信号 X`、
    工具错误 → 红色 `错误: code`，仅异常状态渲染（此前混在状态标签里）。
  - 折叠行图标对齐官方 `leadingFor`：信号终止由黄点改为红点（官方
    `terminalFailed()` 将信号终止计为失败）；新增官方同款读屏专用状态文字
    （StateDot 为纯颜色信号，读屏不可见，原版有此处理而插件缺失）。

## [0.2.0] - 2026-08-29

### Changed (breaking)

- **完全自定义终端卡片，取代官方 bash/pwsh 工具行。** 通过 `tool.call.toolview`
  keyed slot（`priority: -1`）替换官方渲染；折叠行保留官方 DisclosureRow 样式，
  展开后分三区：HEAD（状态/cwd/复制命令/复制输出）+ 命令区（带行号、自动换行）
  + 输出区（`white-space: pre` 横向滚动）。
- **覆盖全部状态**：运行中 / 成功 / 失败(非零退出) / 信号终止 / 中断 / 工具错误 /
  非终端，由 `terminal-card-model.ts` 的 `terminalCardModel()` 派生。
- **包名**：`dsh-shell-card-plus`（v0.3.0 起，原 `dsh-terminal-plus`；名实相符——本插件是命令卡片而非终端）
- **dev/prod 构建分离**：`npm run build` 为生产构建（`__DEV__=false`，HOT 标记
  被消除）；`npm run dev` 为开发构建（watch + 热重载 + HOT 标记验证）。

### Removed

- 独立 Conversation Node（`kind: terminal-plus`）方案——会与官方 tool-call node
  双卡渲染，改为 toolview 插槽替换。
- host CSS 注入方案（`webServer.tapIndex`）——client 半边自带命令换行。

## [0.1.0] - 2026-08-28

Initial release（原 `dsh-terminal-plus-client`）。

### Added

- Copy-command button on bash/pwsh terminal cards.
- Conversation Node rendering (superseded by toolview slot in 0.2.0).
- Independent build (esbuild + lightningcss, `__ModuleLoader__` wrapper).

### Notes

- Display-only; does not change how commands execute or stream.
