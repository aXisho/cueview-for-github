# GlossView for GitHub

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md)

在 GitHub 页面上渲染 [Gloss Markdown](https://github.com/aXisho/glossmd) directive 的 Chrome 扩展。当你在 GitHub 上浏览 `.gloss.md` 文件时，扩展会拦截页面，将 directive 标记转换为丰富的 UI——标注块、标签页、徽章、网格、步骤等。

## 功能介绍

GitHub 本身已能较好地渲染大多数 Gloss Markdown directive（Alert 标注、围栏代码块、行内代码）。此扩展在此基础上进一步提升体验：

**文件视图**（`.gloss.md` blob 页面）：

1. 检测当前 GitHub 页面是否为 `.gloss.md` 文件。
2. 从 `raw.githubusercontent.com` 获取原始源码。
3. 解析 Gloss Markdown directive 树。
4. 用完整的 Gloss Markdown 输出重新渲染页面的 markdown 容器：directive 块被替换为带样式的 DOM 元素（标签页界面、可折叠详情、彩色标注等），纯 Markdown 文本通过 [marked.js](https://marked.js.org/) 渲染。

**编辑页预览**（`/edit/` URL）：

在编辑 `.gloss.md` 文件时点击 **Preview** 标签，扩展会就地增强 GitHub 自己渲染的预览——无需重新获取原始源码，直接替换 Gloss 围栏 directive 块（包括 heading、inline 和 TOC directive）。这意味着预览会反映你尚未保存的编辑。

**Gist 页面**：

自动检测文件名以 `.gloss.md` 或 `.gloss` 结尾的 Gist 文件，从 `gist.githubusercontent.com` 获取原始内容并渲染。

## 支持的 directive

| Directive | 语法 | 说明 |
|-----------|------|------|
| `info` / `tip` / `important` / `warning` / `danger` | `> [!TYPE] title` | 标注块（GitHub Alert） |
| `details` | ` ```details ` 围栏 | 可折叠区块 |
| `card` | ` ```card ` 围栏 | 带边框的卡片 |
| `tabs` / `tab` | ` ````tabs ` + 嵌套 ` ```tab ` | 标签页内容 |
| `steps` / `step` | ` ````steps ` + 嵌套 ` ```step ` | 编号步骤列表 |
| `grid` / `cell` | ` ````grid ` + 嵌套 ` ```cell ` | CSS 网格布局 |
| `math` | ` ```math ` 围栏 | 数学公式（KaTeX MathML） |
| `toc` | `> [!toc ...]` | 自动生成目录 |
| `badge` | `` `text`{badge ...} `` | 行内徽章 |
| `small` | `` `text`{small} `` | 小号灰色文字 |
| `big` | `` `text`{big} `` | 较大的强调文字 |
| `kbd` | `` `text`{kbd} `` | 键盘按键样式 |
| `heading` | `` ## `Title`{heading color=blue} `` | 带背景色的标题 |

GitHub Flavored 脚注（`[^id]`）也会渲染，与 GitHub 本身使用相同的定义 / 反向引用布局。

渲染内容中的代码块在悬停时会显示复制按钮。

## 安装（加载未打包扩展）

扩展尚未发布到 Chrome Web Store。本地安装步骤：

1. 构建扩展（见下文）。
2. 在 Chrome 中打开 `chrome://extensions`。
3. 启用**开发者模式**（右上角开关）。
4. 点击**加载已解压的扩展程序**，选择 `dist/glossview-for-github/` 目录。

## 构建

```bash
npm install
npm run build
```

使用 [Vite](https://vite.dev/) 将 `src/content.ts`（及所有导入文件）打包为 `dist/glossview-for-github/src/content.js`，并生成 `dist/glossview-for-github-1.0.0.zip`。生成的 JavaScript 不会放入 `src/`。

开发时监听变更：

```bash
npm run watch
```

每次重新构建后，在 `chrome://extensions` 的扩展卡片上点击重新加载按钮。

## 测试

```bash
npm test
```

单元测试使用 [Vitest](https://vitest.dev/) 运行。

## 工作原理

```
GitHub blob 视图 (.gloss.md)
  └─ content.ts 在 document_idle 时运行
       ├─ isGlossMdPath() → true
       ├─ getRawUrl() → https://raw.githubusercontent.com/...
       ├─ fetch(rawUrl) → 原始源码文本
       ├─ parseGlossMd(raw) → GlossChild[] 树
       ├─ renderChildren(tree) → DocumentFragment
       └─ container.replaceChildren(fragment) → DOM 更新

GitHub 编辑页预览 (/edit/ URL, Preview 标签)
  └─ content.ts 在标签切换时增强
       ├─ isEditPage() → true
       ├─ findEditContainer() → 预览面板中的 .markdown-body
       ├─ enhanceGitHubPreview(container)
       │    ├─ Pass 1: 围栏块 directive (tabs/details/card/steps/grid/math)
       │    │    └─ <code class="language-NAME"> → renderGlossNode()
       │    ├─ Pass 2: h1〜h6 的 heading directive
       │    ├─ Pass 3: 行内 directive (badge/kbd/small/big)
       │    └─ Pass 4: toc blockquote
       └─ 预置 sentinel 防止重复处理

GitHub Gist 页面
  └─ content.ts 扫描 .js-gist-file-update-container 元素
       ├─ 文件名以 .gloss.md / .gloss 结尾
       ├─ 从 [href*="/raw/"] 链接获取 rawUrl
       └─ applyAndWatch(container, raw) → 与 blob 视图相同的渲染路径
```

解析器（`src/parser.ts`）识别三种 Gloss Markdown directive 语法（GitHub Alert、围栏代码块、行内代码＋花括号属性），生成 `GlossNode` / `TextNode` 树。渲染器（`src/renderer.ts`）遍历树，将每个 directive 委托给 `src/directives/` 中的对应处理器。marked.js 输出的 HTML 通过 [DOMPurify](https://github.com/cure53/DOMPurify) 净化。

## 权限

- `https://github.com/*` — 向 GitHub 页面注入 content script。
- `https://gist.github.com/*` — 向 Gist 页面注入 content script。
- `https://raw.githubusercontent.com/*` — 获取 blob 视图的原始文件内容。
- `https://gist.githubusercontent.com/*` — 获取原始 Gist 文件内容。

无后台 Service Worker。无存储。不收集任何外部数据。

## 许可证

[MIT License](./LICENSE)

### 第三方致谢

本扩展的 CSS 样式派生自 [k1LoW/mo](https://github.com/k1LoW/mo)（经由 [glmo](https://github.com/aXisho/glmo)），同样采用 MIT 许可证。

Copyright © 2026 Ken'ichiro Oyama &lt;k1lowxb@gmail.com&gt;
