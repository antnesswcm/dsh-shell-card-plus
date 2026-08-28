// dsh-shell-card-plus 独立构建脚本
//
// 产出 lib/client.js —— 一个可被 dsh web 客户端模块系统加载的 bundle：
//
//   window.__ModuleLoader__.load({ id: <包名>, factory: (require) => { ... } })
//
// 规则对照官方 packages/client/tsdown.client.ts 的 clientConfig()：
//   - 入口 src/client/index.ts，platform browser，format cjs，输出 lib/client.js；
//   - banner/footer 做 __ModuleLoader__.load 包装（必须，否则插件不会注册）；
//   - externals（运行时从模块表 require，不打包）：react / react/jsx-runtime /
//     react-dom / react-dom/client / @deepseek-ai/cordis / dsh-client-ui-slots /
//     dsh-client-ui-primitives / dsh-client-runtime/client（对应官方 PLATFORM_MODULES
//     + PRELOADED_CLIENT_EXTERNALS）；
//   - x.module.css 经 lightningcss 编译为 hashed class map，并在 factory 执行时
//     注入 <style data-plugin-css>（对应官方 styleInjectionModule）。
//
// 依赖：esbuild + lightningcss（本包 devDependencies，用户安装时不需要）。
import { build } from 'esbuild'
import { transform } from 'lightningcss'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = readFileSync(resolve(ROOT, 'package.json'), 'utf8')
const NAME = JSON.parse(PACKAGE).name

// 平台模块表（运行时由 dsh web 提供，不能打进 bundle）。
const EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
])

// CSS Modules 虚拟加载器：把 x.module.css 编译成 classMap + 样式注入模块。
const CSS_MODULE_PREFIX = '\0dsh-css:'
const CSS_MODULE_SUFFIX = '.mjs'

const cssPlugin = {
  name: 'dsh-css-modules-inline',
  setup(build) {
    build.onResolve({ filter: /\.module\.css$/ }, (args) => {
      if (args.importer === undefined) return null
      return { path: CSS_MODULE_PREFIX + args.resolveDir + '/' + args.path + CSS_MODULE_SUFFIX, namespace: 'dsh-css' }
    })
    build.onLoad({ filter: /.*/, namespace: 'dsh-css' }, (args) => {
      const file = args.path.slice(CSS_MODULE_PREFIX.length, -CSS_MODULE_SUFFIX.length)
      const source = readFileSync(file)
      const { code, exports: cssExports } = transform({
        filename: file,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap = {}
      for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        classMap[local] = exp.name
      }
      const tagId = `${NAME}/${file.split(/[\\/]/).pop()}`
      const sourceCode = [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {`,
        `  const tag = document.createElement('style');`,
        `  tag.dataset.plugin = ${JSON.stringify(NAME)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
      return { contents: sourceCode, loader: 'js', resolveDir: dirname(file) }
    })
  },
}

// SVG→React 插件：把 .svg 文件自动包装为 React 组件。
// 导入后作为 default export 使用，接受 size/className props。
// 组件名由文件名派生（copy_command.svg → SvgCopyCommand），但 JSX 不用关心。
const svgPlugin = {
  name: 'dsh-svg-react',
  setup(build) {
    build.onResolve({ filter: /\.svg$/ }, (args) => {
      if (args.importer === undefined) return null
      return { path: args.resolveDir + '/' + args.path, namespace: 'dsh-svg' }
    })
    build.onLoad({ filter: /.*/, namespace: 'dsh-svg' }, (args) => {
      const file = args.path
      const raw = readFileSync(file, 'utf8')
      // 提取 viewBox 并移除 xml 声明、外层 <svg> 标签、注释
      const viewBox = raw.match(/viewBox="([^"]*)"/)?.[1] ?? '0 0 121 121'
      // 提取 <svg> 内部所有内容（去掉 <svg ...> 和 </svg>）
      const inner = raw.replace(/<\?xml[^>]*\?>/, '').replace(/<!--.*?-->/gs, '').replace(/<svg[^>]*>/i, '').replace(/<\/svg>/i, '').trim()
      // 去除 fill 属性（让组件用 currentColor）
      const cleaned = inner.replace(/\sfill="[^"]*"/g, '')
      const sourceCode = [
        'import { jsx } from "react/jsx-runtime"',
        `export default function SvgIcon({ size = 20, className }) {`,
        `  return jsx("svg", { width: size, height: size, viewBox: ${JSON.stringify(viewBox)}, fill: "currentColor", className, "aria-hidden": true, dangerouslySetInnerHTML: { __html: ${JSON.stringify(cleaned)} } });`,
        '}',
      ].join('\n')
      return { contents: sourceCode, loader: 'jsx', resolveDir: dirname(file) }
    })
  },
}

// banner/footer：web 客户端模块系统靠这个注册闭包工厂。esbuild 的 cjs 输出
// 会引用顶层 module/exports（相当于官方 rolldown 的 intro），所以两者都放
// banner 开头，随后打开 factory 闭包。
const banner = [
  'var module = { exports: {} }; var exports = module.exports;',
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(NAME)}, factory: (require) => {`,
].join('\n')
const footer = 'return module.exports; } });'

// host 半边 stub：让 cordis.patch.yml 行可被 Loader 正常解析（客户端实际在 client.js）。
mkdirSync(resolve(ROOT, 'lib'), { recursive: true })
const hostStub = `export const name = 'shell-card-plus'\n\nexport function apply() {}\n`
if (!existsSync(resolve(ROOT, 'lib/index.js'))) {
  writeFileSync(resolve(ROOT, 'lib/index.js'), hostStub, 'utf8')
}

// --watch: esbuild 文件监听 + 每次重编后 touch lib/index.js，让 dsh web 的
// client-modules 轮询发现 lib/client.js 内容变化并广播热重载。浏览器不刷新。
// --prod: 生产构建（移除 dev-only 标记，用户安装时使用）。
// 默认（无参数）：开发构建（含 HOT 等 dev 标记，热重载就绪）。
const WATCH = process.argv.includes('--watch')
const PROD = process.argv.includes('--prod')

const options = {
  entryPoints: [resolve(ROOT, 'src/client/index.tsx')],
  outfile: resolve(ROOT, 'lib/client.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2024',
  sourcemap: true,
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.js': 'js' },
  jsx: 'automatic',
  define: {
    // 生产构建：__DEV__ 替换为 false → 死代码（HOT 标签等）被 esbuild 消除。
    // 开发构建：保留 true，HOT 标签可见。
    __DEV__: PROD ? 'false' : 'true',
  },
  external: [...EXTERNALS],
  banner: { js: banner },
  footer: { js: footer },
  plugins: [cssPlugin, svgPlugin],
  logLevel: 'info',
}

// touch host stub：client-modules 的 pkgMeta 缓存不变，但 HMR 的 rebuilt()
// 对每个 graph bundle 重算 rev，任何文件变化都会广播。这里 touch lib/index.js
// 让 dsh web 感知"有新构建产出"。
function stampHost() {
  const stamp = new Date().toISOString()
  writeFileSync(resolve(ROOT, 'lib/index.js'), hostStub + `// ${stamp}\n`, 'utf8')
}

// esbuild 0.24 的 context().watch() 不暴露 onRebuild 回调（那是 CLI --on-rebuild
// 的形态），而我们必须用 JS API 的 CSS plugin。因此 watch 模式采用与 dsh web
// 对齐的轮询：ctx.watch() 负责自动重建 lib/client.js，这里每 500ms 对比 mtime，
// 变化即 touch host stub。与官方 "any process rewriting lib/client.js triggers HMR"
// 的设计一致，不依赖 esbuild 版本行为。
if (WATCH) {
  const { context: esbuildContext } = await import('esbuild')
  const ctx = await esbuildContext(options)
  await ctx.watch()
  const clientPath = resolve(ROOT, 'lib/client.js')
  let last = statSync(clientPath).mtimeMs
  const timer = setInterval(() => {
    try {
      const now = statSync(clientPath).mtimeMs
      if (now !== last) {
        last = now
        stampHost()
        console.log(`[${new Date().toISOString()}] rebuilt lib/client.js — dsh web 将热重载`)
      }
    } catch {
      // lib/client.js 暂不可读（重建写盘中）——下个 tick 再试。
    }
  }, 500)
  console.log('watching src/ — dsh web 将热重载（Ctrl+C 退出）')
  await new Promise((resolveWait) => {
    process.on('SIGINT', () => { clearInterval(timer); ctx.dispose().finally(resolveWait) })
    process.on('SIGTERM', () => { clearInterval(timer); ctx.dispose().finally(resolveWait) })
  })
} else {
  await build(options)
}

console.log('built: lib/client.js (dsh-shell-card-plus)')
