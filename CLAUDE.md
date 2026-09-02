# CLAUDE.md — 开发手册

> 给接手的开发者/agent 的完整指南。阅读顺序：**这是什么** → **架构** → **关键机制** → **状态矩阵** → **构建与热重载** → **常见陷阱** → **文件地图**。

## 1. 这是什么

`dsh-shell-card-plus` 是 DSH Web（DeepSeek Harness）的**客户端插件**，用 React 渲染的完全自定义卡片替换官方 bash/pwsh 工具行。

它**不是** host 插件——不注入 CSS、不改 React DOM，而是通过官方 **Conversation 的 toolview 插槽机制**注册一个 React 组件，由 React 自己渲染。

**一句话**：注册 `tool.call.toolview` 的 `bash`/`pwsh` 两个 key，替换官方原子工具行。

---

## 2. 架构

```
src/
├── index.ts                    # host 半边 stub（空 apply，仅让包被 Loader 激活）
└── client/                     # client 半边（浏览器 React）
    ├── index.tsx               # 插件入口：注册 bash/pwsh 的 toolview slot
    ├── ToolCallRow.tsx         # 折叠行（官方 DisclosureRow + IconApiOutline14）+ 展开 ShellCard
    ├── ToolCallRow.module.css
    ├── ShellCard.tsx           # 展开后卡片：head（状态/cwd/分割按钮）+ 命令区 + 输出区
    ├── ShellCard.module.css
    ├── terminal-card-model.ts  # 状态矩阵派生 + 复制工具 + 标签 + cwd 解析
    ├── icons.tsx               # 图标 re-export（从 assets/*.svg 自动生成）
    └── assets/
        ├── copy_command.svg    # 复制命令图标（入库，构建时自动转组件）
        └── copy_output.svg     # 复制输出图标（入库，构建时自动转组件）
```

### 运行时装配（为什么这么接）

1. `package.json` 的 `dsh.bundle.patch` 指向本包 `cordis.patch.yml`，`dsh plugin add` 时被自动加进 profile 的 `dsh.profile.bundles`，包内 patch（`- insert: - id: shell-card-plus / name: dsh-shell-card-plus`）随之自动应用——**安装即生效，无手动配置**。
2. Loader 加载 host stub（`src/index.ts`，`apply` 为空）——**它存在的唯一意义**是让包在 Loader 里成为 entry。
3. `dsh-client-modules` 扫描 loader entries，读到 `package.json` 的 `dsh.client` 声明（`platform: 'web'` + `exports["./client"]`），把 `lib/client.js` 编进 `window.__DSH_BOOT__`。
4. 浏览器加载 `lib/client.js`，`__ModuleLoader__.load({ id: "dsh-shell-card-plus", factory })` 注册 bundle。
5. bundle 的 `apply()` 调用 `ctx.slots.inject('tool.call.toolview', ...)`，注册 `bash`/`pwsh` 两个 key 的渲染器。
6. 官方 `ToolCallTree` 渲染每个 tool call 时，按 `toolName` 分派到 keyed slot——命中我们的 key → 渲染 `ToolCallRow`。

### 为什么用 toolview 而不是 Conversation Node

**不要**注册独立的 `conversationEvents` Conversation Node。如果注册了，它会和官方 `tool-call` node 同时匹配同一个 `tool/call` 事件，导致**两张卡片**同时渲染。官方工具行已经在 `tool-call` node 里渲染，我们只需要替换**行内视图**，所以走 `tool.call.toolview` keyed slot。

---

## 3. 关键机制

### 3.1 toolview keyed slot 与 priority 阴影

官方 `ToolCallTree`（`dsh-client-ui-tool` 包内）的分派：

```tsx
renderSlot('tool.call.toolview', owner, { entryKey: toolName, fallback: GenericToolCard })
```

- 官方在**同一包内**已注册 `key: 'bash'`（组件 `BashRow`，未设 priority，默认 0）。
- 我们注册 `key: 'bash'` + `priority: -1`——slot 是**最低 priority 渲染**，`-1 < 0`，所以我们替换官方。
- **必须** `priority: -1`，否则同 key 同 priority 会抛错（`Failed to load plugins ... already has an entry for key "bash"`）。

### 3.2 数据来源（ToolCallBlock）

数据完全来自 `tool/call` + `tool/result` 事件，**不需要 host 端发任何新事件**：

- `callView`（`card: 'terminal'`）：command（`title`）、cwd、description —— 运行中也有
- `resultView`（`card: 'terminal'`）：output、exitCode、signal —— 结束后才有

契约见官方 `@deepseek-ai/dsh-tools/src/presentation.ts` 的 `TerminalCallView`/`TerminalResultView`。

### 3.3 __DEV__ / prod 分离

`build.mjs` 用 esbuild `define` 把 `__DEV__` 替换为 `true`（dev）或 `false`（prod）：

- dev（`npm run dev` / `node scripts/build.mjs --watch`）：`__DEV__ = true`，卡片顶部显示 `HOT-7 | ToolCallRow` 标签（改 `HOT` 数字验证热重载）。
- prod（`npm run build`）：`__DEV__ = false`，死代码被 esbuild 消除，HOT 标签完全不在产物里。

**用户永远跑 prod 构建**。开发时用 dev。

---

## 4. 状态矩阵

`terminal-card-model.ts` 的 `terminalCardModel(block, sessionCwd)` 派生 7 种状态：

| 状态 kind | 触发条件 | 折叠行图标 | head 可见异常信息 |
|---|---|---|---|
| `running` | 无 `kind` 字段（只有 callView） | 普通图标 + 动画 | 无（状态文字仅读屏） |
| `done` | resultView 存在，exitCode 0，无 signal | 普通图标 | 无（状态文字仅读屏） |
| `failed` | resultView.exitCode ≠ 0 | 红点 | 红色 `退出码 N` |
| `signaled` | resultView.signal 存在 | 红点 | 红色 `信号 SIGxxx` |
| `interrupted` | block.isError && error.code === 'interrupted'（合成块） | 黄点 | 无（状态文字仅读屏） |
| `error` | block.error 存在（工具调用本身出错） | 红点 | 红色 `错误: code` |
| `non-terminal` | resultView.card 不是 'terminal' | 普通图标 | 无（状态文字仅读屏） |

**每个状态承载的数据**：

- command：始终有（callView.title，或 resultView.title 替换）
- cwd：`resolveTerminalCwd`（相对路径拼 sessionCwd，`.`/`..` 折叠），显示时只取**最后一段**（子目录名，官方 `promptLabel` 逻辑）
- output：`running`/`interrupted` 无；其他状态可能无（空输出）
- 复制命令：command 非空即可用
- 复制输出：output 非空才可用

**注意**：`failed` 状态的 `block.isError` 是 `false`（bash/pwsh 把非零退出码当正常结果返回），所以不能靠 `isError` 判断失败——要查 `resultView.exitCode`/`signal`。

---

## 5. 构建与热重载

### 5.1 独立构建

本包**完全独立**，不依赖 dsh 单仓库。构建脚本 `scripts/build.mjs`：

- esbuild 打包 `src/client/index.tsx` → `lib/client.js`
- `banner`/`footer` 做 `__ModuleLoader__.load` 包装（**必须**，否则插件不注册）
- externals（运行时从模块表 require，不打包）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-runtime/client`
- `x.module.css` 经 lightningcss 编译为 hashed class map，注入 `<style data-plugin-css>`（CSS Modules 语义）
- `assets/*.svg` 经 `svgPlugin` 自动包装为 React 组件（见下）

### 5.1.1 SVG 图标管道（改图标无需碰代码）

图标**入库**在 `src/client/assets/*.svg`，构建时由 `svgPlugin` 自动转 React 组件：

- 源码 `import IconCopyCommand from './assets/copy_command.svg'` → 得到接受 `{ size, className }` 的组件
- 组件用 `currentColor` 填充（SVG 里的 `fill` 属性被自动移除），随主题变色
- 组件通过 `dangerouslySetInnerHTML` 注入 SVG 内部内容（path）

**以后改图标**：替换 `assets/` 下的 SVG 文件 + `npm run dev`（或 `npm run build`），无需碰任何 TSX。`icons.tsx` 只是 re-export 入口。

**为什么不用 SVG 文件直接引用**：client bundle 是单个 `lib/client.js`，无静态资源通道；内联 path 用 `currentColor` 跟随主题；官方 `dsh-client-ui-primitives` 的图标（如 `IconApiOutline14`）也是内联 path 组件。

### 5.1.2 dev / prod 构建分离

- `npm run build`（`--prod`）：`__DEV__` 替换为 `false`，HOT 标签等 dev 标记被 esbuild 死代码消除
- `npm run dev`（`--watch`）：`__DEV__` 保留 `true`，HOT 标签可见（验证热重载）
- **用户安装永远跑 prod 构建**；开发时用 dev

**注意**：`npm run dev`（watch）和 `npm run build`（prod）写同一个 `lib/client.js`，后跑者覆盖前者。不要同时跑两个——用 watch 时只跑 `npm run dev`。

### 5.2 热重载循环（开发）

```
终端 A: npm run dev        # esbuild watch：改 src/ 自动重编 lib/client.js
终端 B: dsh web            # dsh 每 500ms 轮询 lib/client.js，检测变化 → 浏览器热重载插件
浏览器: 看 HOT 标签         # 改 HOT 数字，看标签颜色/文案变化，确认 HMR 生效
```

**细节**：esbuild 0.24 的 `context().watch()` 不暴露 `onRebuild` 回调，所以 `build.mjs` 用**每 500ms 轮询 `lib/client.js` 的 mtime**，变化即 touch `lib/index.js`（让 dsh 的 client-modules 感知）。与官方 "any process rewriting lib/client.js triggers HMR" 一致。

### 5.3 安装到 dsh

```sh
dsh plugin --profile web add ./dsh-shell-card-plus   # 本地路径
# 或发布后
dsh plugin --profile web add dsh-shell-card-plus     # npm（推荐，免 allowBuilds）
dsh plugin --profile web add github:antnesswcm/dsh-shell-card-plus  # GitHub
```

本包在 `package.json` 里声明了 `dsh.bundle.patch: "./cordis.patch.yml"`，`dsh plugin add` 会自动把它加入 profile 的 `dsh.profile.bundles` 并应用包内 patch（插入 loader entry）。**无需手动改 profile 的 cordis.patch.yml**，装完重启 `dsh web` 即生效。

**npm 安装 vs GitHub 安装**：npm 包（`lib/` 已在 `files` 里）直接拿预构建产物，跳过 pnpm 对 git 源构建脚本的 `allowBuilds` 白名单审批；GitHub 源安装会要求用户在 `pnpm-workspace.yaml` 加 `onlyBuiltDependencies` 或按 pnpm 提示处理。因此**对外文档一律推荐 npm 安装**。

---

## 6. 常见陷阱

1. **不要注册独立 Conversation Node** → 会和官方 tool-call node 双卡渲染。
2. **toolview 注册必须 `priority: -1`** → 否则 `already has an entry for key "bash"` 报错。
3. **`package.json` 的 `dsh.client.inject`** 必须包含 `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-conversation`，且 `exports["./client"]` 必须指向 `lib/client.js`——缺失会 `MissingClientBundleError`。
4. **import 类型用 `import type`** → 会被擦除，不会进 bundle 也不占 external。`ToolCallViewProps` 从 `@deepseek-ai/dsh-client-ui-tool` import type 是安全的（运行时不需要）。
5. **不要 import 非平台模块的值**（如 `dsh-client-ui-tool` 的 `terminalCardModel`）→ 会触发 build 报错或运行时 require 失败。我们**内联**了它的纯逻辑到 `terminal-card-model.ts`。
6. **输出区不能复用官方 TerminalBlock** → 它自带 header（`$` + 绿点 + 复制按钮），会多出"第三段"。输出区用纯 `<pre class="output">`。
7. **cwd 显示要取子目录名**（`promptLabel` 逻辑），不是全路径。
8. **更名/重建后要重装到 profile**：`dsh plugin remove` 旧包 + `add` 新包（v0.3.0 由 `terminal-plus` 改为 `shell-card-plus`，升级用户需重装）。
9. **dsh web 与 `pnpm run build`（官方仓库）不能并发**——但那与本包无关，本包独立构建。

---

## 7. 文件地图

| 文件 | 职责 |
|---|---|
| `src/index.ts` | host stub（空 apply，激活包用） |
| `src/client/index.tsx` | 入口：注册 bash/pwsh toolview slot（priority -1） |
| `src/client/ToolCallRow.tsx` | 折叠行（DisclosureRow + IconApiOutline14 图标 + 摘要）+ 展开 ShellCard |
| `src/client/ShellCard.tsx` | 展开卡片：head（状态/cwd/分割按钮）+ 命令区 + 输出区 |
| `src/client/ShellCard.module.css` | ShellCard 样式 |
| `src/client/terminal-card-model.ts` | 状态矩阵派生 + 复制 + 标签 + cwd 解析（纯逻辑，内联官方） |
| `src/client/icons.tsx` | 图标 re-export（从 assets/*.svg 自动生成） |
| `src/client/assets/*.svg` | 图标源文件（改图标只动这里） |
| `scripts/build.mjs` | 独立构建（esbuild + lightningcss + svgPlugin），dev/prod 分离，watch 热重载 |
| `cordis.patch.yml` | loader entry 插入声明 |
| `screenshots.json` | 市场截图声明（docs/preview/ 下图片路径） |
| `README.md` | 用户文档 |
| `docs/DEVELOPMENT.md` | 本开发手册 |

---

## 8. 上架 awesome-dsh-plugin 市场流程

### 前置条件

- ✅ **`dsh.bundle` manifest**：`package.json` 已声明 `dsh.bundle.patch: "./cordis.patch.yml"`（已完成）
- ✅ **`dsh-plugin` topic**：仓库已添加（已完成）
- ⚠️ **提交数 ≥ 10**：当前 `dev` 已达标（10+ commits）
- ⚠️ **仓库创建满 1 天**：2026-08-29 创建，已满足
- ⚠️ **`peerDependencies` 预发布兼容**：当前 `>=4.0.1` 不含预发布标签，`@deepseek-ai/cordis` 4.x 无预发布时 OK（参见 contributings.md 第 132-140 行的预发布分支说明）

### 投稿步骤

1. Fork [`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
2. 在 `data/plugins/` 下创建 `antnesswcm__dsh-shell-card-plus.yml`：

```yaml
url: https://github.com/antnesswcm/dsh-shell-card-plus
name: antnesswcm/dsh-shell-card-plus
category: ui
description:
  en: Shell command cards (bash / pwsh) for the DSH web UI: fully custom React-rendered tool cards replacing the official terminal tool rows — status dot, cwd, error pill, copy command/output, numbered command + scrollable output.
  zh: DSH Web 的 bash/pwsh 命令卡片增强插件，用自定义 React 卡片替换官方工具行——状态点、当前目录、错误标签、复制命令/输出、编号命令区与可滚动输出。
```

3. 提 PR，CI 自动校验后评审合并
4. 合并后，市场页面自动重建，`screenshots.json` 截图自动展示

### 后续维护

- **更新截图**：直接推本仓库 `docs/preview/` 下图片，下一次市场构建自动生效（无需再去提 PR）
- **更新描述**：编辑上述 YAML 文件再提 PR
- **发布 npm 包**（可选）：`repository` 字段需指回 GitHub 仓库，市场会自动关联下载量统计
