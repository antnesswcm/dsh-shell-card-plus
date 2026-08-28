<p align="center">中文 | <a href="README.en.md">English</a></p>

# dsh-shell-card-plus

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.1.0--rc.5-blue)](https://github.com/deepseek-ai/deepseek-harness)

**Shell 命令卡片增强** —— DSH Web 对话流中 bash / pwsh 调用的增强卡片插件。用 React 渲染的**完全自定义卡片**替换官方终端工具行，把每条命令变成可折叠、可复制、可回看的 Shell 命令卡片（不是终端模拟器，只美化会话里的命令调用展示）。

---

## 效果

<!-- TODO: 用真实截图替换以下两处。截图放 docs/preview/ 下：
     card-collapsed.png（折叠摘要行）、card-expanded.png（展开后 head+命令+输出）。 -->

![卡片折叠状态](docs/preview/card-collapsed.png)

![卡片展开状态](docs/preview/card-expanded.png)

| 折叠状态 | 展开状态 |
|---|---|
| 官方 DisclosureRow 风格摘要行，状态点 + 工具名 + 命令首行 | 自定义 head（状态 + cwd + 复制按钮）+ 命令区（带行号）+ 输出区 |

---

## 功能

- **完全自定义命令卡片**：取代官方 bash/pwsh 工具行，折叠行保留官方样式，展开后分三区
  - **HEAD**：运行状态点（StateDot）+ cwd（子目录名）+ 异常信息（仅失败时：
    红色 `退出码 N` / `信号 X`，官方同款）+ 两个复制按钮（复制命令 / 复制输出）；
    状态文字仅读屏可见（对齐官方"正常即沉默，异常才发声"）
  - **BODY1 命令区**：完整命令行，带行号（`pre-wrap` 自动换行）
  - **BODY2 输出区**：`white-space: pre` 横向滚动，与原版一致
- **覆盖所有状态**：运行中 / 成功 / 失败(非零退出) / 信号终止 / 中断 / 工具错误 / 非终端
- **仅接管 bash/pwsh**：其他工具（read/write/search/web 等）走官方默认卡片
- **热重载开发**：`npm run dev` 改源码秒级更新，浏览器不刷新

---

## 安装

```sh
# 从 GitHub 安装
dsh plugin --profile web add github:antnesswcm/dsh-shell-card-plus

# 本地包
dsh plugin --profile web add ./dsh-shell-card-plus

# 安装后刷新页面（Ctrl+F5 / Cmd+Shift+R）
```

### 依赖

| 包 | 作用 |
|---|---|
| `@deepseek-ai/dsh` | dsh CLI（≥0.1.0-rc.5） |

构建时依赖（`devDependencies`）：`esbuild`、`lightningcss`，仅开发者需要，用户安装时不需要。

---

## 原理

### 架构

```
dsh web 进程
  └─ Loader (cordis)
       └─ shell-card-plus  (host stub，lib/index.js)
            └─ dsh-client-modules 扫描 dsh.client 声明
                 └─ window.__DSH_BOOT__ 中加入 shell-card-plus entry
                      └─ 浏览器加载 lib/client.js
                           └─ __ModuleLoader__.load({ id: "dsh-shell-card-plus", factory })
                                └─ ctx.slots.inject('tool.call.toolview', { key:'bash', priority:-1 })
                                     └─ ToolCallRow 渲染
                                          └─ ShellCard (head + 2 body)
```

### 关键机制

- **tool.call.toolview keyed slot**：官方 `ToolCallTree` 按 `toolName` 分派到 keyed slot，`priority: -1` 阴影（shadow）官方 `bash-toolview-sample` 的 `priority: 0`，注册即替换。
- **数据来源**：全部来自 `tool/call` + `tool/result` 的 `ToolCallBlock`，通过 `callView`/`resultView` 的 `card:'terminal'` 契约获取 command/cwd/output/exitCode/signal。
- **状态矩阵**：`terminal-card-model.ts` 的 `terminalCardModel()` 派生 7 种状态。

### 状态矩阵

| 状态 | 触发条件 | command | cwd | output | exitCode | signal | 复制命令 | 复制输出 |
|---|---|---|---|---|---|---|---|---|
| `running` | 只有 callView，无 result | ✅ | ✅ | - | - | - | ✅ | ❌ |
| `done` | exitCode=0，无 signal | ✅ | ✅ | ✅ | 0 | - | ✅ | ✅ |
| `failed` | exitCode≠0 | ✅ | ✅ | ✅ | ≠0 | - | ✅ | ✅ |
| `signaled` | signal 存在 | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ |
| `interrupted` | turn/step 关闭，中断合成 | ✅ | ✅ | - | - | - | ✅ | ❌ |
| `error` | 工具调用出错（error 字段） | ✅ | ✅ | 可能 | - | - | ✅ | 可能 |
| `non-terminal` | resultView.card 不是 terminal | ✅ | ✅ | ✅ | - | - | ✅ | ✅ |

---

## 构建

本包完全独立构建，不依赖 dsh 单仓库。

```sh
npm install          # 安装构建依赖
npm run build        # 生产构建（lib/client.js，移除 dev 标记）
npm run dev          # 开发模式（watch + 热重载，含 HOT 标记用于验证）
```

产物 `lib/client.js` 是唯一需要随包分发的文件（`lib/index.js` 是 host stub）。

---

## 开发

参见 [DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## License

MIT
