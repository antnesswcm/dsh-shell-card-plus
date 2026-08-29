<p align="center">中文 | <a href="README.en.md">English</a></p>

# dsh-shell-card-plus

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.1.0--rc.5-blue)](https://github.com/deepseek-ai/deepseek-harness)

DSH Web 里 bash / pwsh 命令卡片的增强插件。装完即用，不改任何命令执行逻辑。

## 解决什么问题

DSH Web 原版的 bash/pwsh 命令卡片有两个日常痛点：

| 痛点 | 原版 | 本插件 |
|---|---|---|
| 长命令看不全 | 命令单行显示，横向滚动，超过一屏就看不见 | 命令**自动折行**，带行号，一眼看全 |
| 想改命令没有入口 | 只有"复制输出"，复制命令得手动划选 | **复制命令**、**复制输出**两个独立按钮 |

状态显示对齐官方规范：正常时安静（只有一个状态点），失败时才显示红色 `退出码 N` / `信号 X`。

<!-- TODO: 截图放 docs/preview/ 下（card-collapsed.png / card-expanded.png）后补这里 -->

## 功能

- 完全替换官方 bash/pwsh 工具行：折叠行样式与官方一致，展开后是自定义卡片
  - **head**：状态点 + cwd（子目录名）+ 复制命令/复制输出按钮
  - **命令区**：完整命令，自动折行 + 行号
  - **输出区**：横向滚动，保留原版阅读习惯
- 仅接管 bash/pwsh，其他工具（read/write/search 等）不受影响

## 安装

```sh
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:antnesswcm/dsh-shell-card-plus

# 或本地目录
dsh plugin --profile web add ./dsh-shell-card-plus
```

装完重启 `dsh web`（或浏览器 Ctrl+F5）生效。要求 dsh ≥ 0.1.0-rc.5。

## 工作方式

通过官方 `tool.call.toolview` 插槽注册 `bash`/`pwsh` 两个 key，替换官方对该工具行的渲染。命令、cwd、输出、退出码全部来自官方已有的 ToolCallBlock 数据，插件是纯展示层，不引入任何新事件或 host 改动。实现细节见 [CLAUDE.md](CLAUDE.md)。

## 开发

```sh
npm install
npm run build   # 生产构建（lib/ 已入库，用户装包不需要构建）
npm run dev     # watch + 热重载
```

开发与接手文档见 [CLAUDE.md](CLAUDE.md)。

## License

MIT
