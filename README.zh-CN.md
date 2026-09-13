<p align="center">
  <img src="docs/logo.svg" width="72" height="72" alt="">
</p>

<h1 align="center">Type Editor</h1>

<p align="center">
  边写边渲染的桌面 Markdown 编辑器。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="https://dtio.org">dtio.org</a>
</p>

![编辑器：Markdown 文档就地渲染](docs/screenshot.png)

## 这是什么

用 Type Editor 打开一个 Markdown 文件，它读起来就是一篇排好版的文档。光标不在
的那些行，标记符号（`#`、`**`、反引号、链接地址）会被隐藏，留下的部分按语义显示：
标题就是标题，表格就是表格，公式会被排版出来。把光标移到某一行上，那一行的源码就
回来供你编辑。

用 Electron、React 和 CodeMirror 6 写成，一次只编辑一个文档：没有标签页，没有分栏，
只有你正在写的那份文件。

## 功能

**实时预览。** 标题、强调、列表、任务列表、表格、引用、带语法高亮的代码块、图片和
分隔线，都写在哪儿就渲染在哪儿。光标落到某一行时，该行恢复显示 Markdown 源码，并带
一小段淡入，让这次切换看得清楚。

**公式。** `$行内$`、`$$独占一行$$`、`\(…\)` 和 `\[…\]` 都由 KaTeX 渲染。多行的
展示公式会折叠源码，变成一个居中的块；代码里的 `$` 不会被当成公式。

**Markdown 之外的那些写法。** `==高亮==`、`^上标^`、`~下标~`、脚注（`[^1]`，定义
统一收到文末）、定义列表和 YAML 前言，预览与导出都支持。

**原始 HTML，但没有脚本。** 想写表格、`<details>` 或图文排版，直接写 HTML 就能渲染。
script、style、所有 `on*` 事件属性和 `javascript:` 地址都会在插入页面前被清掉。

**导出。** 可以导出成一张 PNG，也可以导出成真正的 `.docx`——公式会以图片嵌入，Word
里显示正常。导出页面与预览使用同一套排版尺寸，所见即所得。

**自动保存，以及文档会回来。** 标题栏里可以设置间隔：30 秒、1 分钟、5 分钟或关闭；
它只会写入已经有路径的文档，所以不会突然弹出保存对话框。下次打开窗口时，你上次在编辑
的文档（无论是否保存过）和最近打开的文件列表都会恢复。

**查找替换。** 用的是自己的面板而不是浏览器默认的：区分大小写、全字匹配、正则表达式，
并实时显示命中的位置。

**大纲、专注模式、打字机模式。** 大纲按标题层级嵌套列出全文，并标出你正在读的那一节。
专注模式会淡化当前段落之外的正文，打字机模式让光标所在行保持在窗口中间。

## 设置

![设置面板](docs/settings.png)

七套配色——默认的暖色、两套极简、普通浅色与深色、以及两套 Anthropic 配色。十七种正文
字体，每一项都用自己的字体显示。正文字号、行距、正文宽度、左右边距、制表符宽度。四种
界面语言：English、简体中文、繁體中文、日本語。再加上上面两种视图模式。所有这些都存在
IndexedDB 里，和上次的文档、最近打开的文件列表放在一起。

## 开始使用

从 releases 页面下载安装包，或者自己构建：

```bash
npm install
npm run dev       # Vite 开发服务器 + Electron，热更新
```

```bash
npm run build     # 构建主进程、预加载和渲染进程到 out/
npm run pack      # 免安装版本输出到 release/
npm run dist      # 安装包与便携 zip 输出到 release/
```

如果安装时需要走代理：

```bash
# PowerShell
$env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

`npm test` 会先对两个项目做类型检查，再针对生产构建跑一遍端到端检查：用真实的输入链路
敲进一篇文档，断言实时预览确实装饰了标题、公式、任务列表、代码块和图片，大纲列出了标题，
查找替换可用，设置能持久化，两个导出器都产出合法文件。任何渲染进程的控制台报错都会让测试
失败，这也是 CSP 保持严谨的原因。

## 快捷键

| | |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` | 新建 / 打开 |
| `Ctrl+S` / `Ctrl+Shift+S` | 保存 / 另存为 |
| `Ctrl+Shift+A` | 切换自动保存间隔 |
| `Ctrl+Shift+E` / `Ctrl+Shift+W` | 导出为 PNG / Word |
| `Ctrl+F` | 查找替换 |
| `Ctrl+/` | 实时预览与源码模式切换 |
| `Ctrl+E` | 行内代码 |
| `Ctrl+Shift+K` | 代码块 |
| `Ctrl+,` | 设置 |
| `Ctrl+Shift+O` | 大纲 |
| `Ctrl+Shift+F` / `Ctrl+Shift+T` | 专注模式 / 打字机模式 |
| `Ctrl+Shift+H` | 主页 |

## 目录结构

```
src/
  main/             Electron 主进程
    index.ts         应用生命周期
    window.ts        无边框窗口、各平台的窗口外观
    ipc.ts           文件读写、导出落盘、未保存提示窗口
    menu.ts          应用菜单，命令转发给渲染进程
  preload/          contextBridge 暴露的接口——渲染进程唯一的特权入口
  shared/           两端共用的频道名、载荷类型和菜单文案
  renderer/
    index.html       编辑器窗口
    dialog.html      未保存提示，一个独立窗口
    src/
      about.md        关于页，本身就是一份 Markdown 文档
      welcome.md      没有可恢复内容时打开的首页
      editor/         CodeMirror 装配、主题、实时预览装饰、各类 widget
      components/     标题栏、命令栏、状态栏、大纲、设置、查找栏、字体选择
      export/         PNG 与 Word 导出
      lib/            带扩展语法的 markdown-it、设置、多语言、
                      IndexedDB 存储、路径处理、logo
scripts/            冒烟测试、截图、导出测试页（仅开发用）
docs/               本文件引用的图片
```

## 设计

默认配色刻意偏暖，而不是常见的蓝灰：所有中性色都是暖的，分隔用发丝线而不是投影，圆角
接近直角，只用一种陶土色（`#b0553a`）承担交互。正文落在几乎感觉不到暖意的纸上
（`#fdfcf9`），界面是白的。

这套配色只是七个预设之一。它们在 `src/renderer/src/styles/global.css` 里用同一组
token 名称定义，通过根元素上的 `data-theme` 切换。结构与配色分离——圆角、动效、字体、
尺寸都是固定的，而且文档的排版尺寸与导出共用。动效遵循 Fluent：三条曲线、一套时长梯度，
每一个状态变化都有过渡。

标志是一个现代排版风格的 T 结合右侧的光标插入符。它由 `lib/logo.ts` 里的
一组坐标画出来，标题栏、首页和关于页读的都是这一份。

## 安全

渲染进程运行在沙箱中，开启 `contextIsolation`，没有 Node 集成。Markdown 里允许写原始
HTML——文档理应能放一张表格或一个 `<details>`——但它会先被解析成真正的 DOM，在那里清洗：
script 和 style 元素、所有 `on*` 属性、任何 `javascript:` 地址都会被移除，之后才插入
页面。严格的 CSP 只注入到生产构建里，因为 Vite 开发服务器需要内联的 React-refresh 前导
脚本。

## 已知限制

- 远程图片可以显示，但不会被嵌入 Word 导出；只有 `data:` 地址会被嵌入。需要在 `.docx`
  里带上图片的话，请用 data URL。
- Word 导出里的有序列表共用同一个编号实例，多个独立的有序列表会连成一个序列。
- 编辑表格、渲染出来的 HTML 块或展示公式时，会先显示其源码，光标离开后恢复渲染——这与
  编辑器其余部分的行为一致。

## 许可

MIT，见 [LICENSE](LICENSE)。

由 [Datatype Team](https://dtio.org) 开发，主要开发者：Simalth Wang。
