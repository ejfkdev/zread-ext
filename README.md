# Zread Docs for GitHub

> 在 GitHub 仓库页直接阅读 [zread.ai](https://zread.ai) 的 AI 文档。
> Read [zread.ai](https://zread.ai) AI-generated docs right on any GitHub repository page.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4c9a52)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-f5c542)
![Version](https://img.shields.io/badge/version-2.30.0-informational)

在仓库页左侧生成 zread 文档目录，点击即在 README 区域阅读，无需切换标签。
A documentation sidebar appears beside the README; click any entry to read in place — no tab switching.

---

## ✨ 功能 · Features

| | |
|---|---|
| 📚 **目录侧栏 / TOC sidebar** | 可折叠 section/group，点击在 README 区域阅读 · Collapsible TOC, read in the README area |
| 🔁 **README 切换 / Restore** | 点原生 `README` 标签恢复原始内容 · Click the native tab to restore the README |
| ⚡ **缓存 + 预取 / Cache & prefetch** | ≤50MB LRU 本地缓存，后台串行预取，二次秒开 · Local LRU cache + serial prefetch |
| 🤖 **自动收录/刷新 / Auto index & refresh** | 未收录自动提交并显示排队 ETA；超 7 天自动刷新；刷新中仍展示旧文档 · Auto-submit with queue ETA; auto-refresh; keep old docs while refreshing |
| 🧩 **代码复制 / Copy code** | 仿 GitHub 的代码块复制按钮 · GitHub-style copy button on code blocks |
| 📊 **Mermaid / Diagrams** | 渲染流程图 + 全屏预览（缩放/拖动/重置），按需分包加载 · Rendered diagrams with a fullscreen viewer, loaded on demand |
| 🌙 **暗色模式 / Dark mode** | 跟随系统 `prefers-color-scheme` · Follows system preference |
| 🌐 **国际化 / i18n** | 浏览器为中文时显示中文，否则英文（界面+内容） · Chinese only when the browser is Chinese, else English |

## 🚀 开始 · Getting Started

**要求 / Requirements**：Node.js ≥ 18，Chrome（开发者模式）。

```bash
# 安装依赖 / install
npm install

# 开发：自动打开带扩展的 Chrome / dev: launches Chrome with the extension
npm run dev

# 构建到 dist/chromium / build
npm run build
```

**加载 / Load unpacked**

1. 打开 `chrome://extensions`，开启 **开发者模式** · Open `chrome://extensions`, enable **Developer mode**.
2. 点击 **加载已解压的扩展程序**，选择 `dist/chromium` · Click **Load unpacked**, select `dist/chromium`.
3. 打开任意仓库页，如 `https://github.com/owner/repo`（带/不带尾斜杠均可）· Open any repo page.

## 🧩 原理简述 · How it works

- **Content script** 在 GitHub 仓库页注入左侧目录，复用 README 容器渲染文档。
- **Service worker** 负责请求 zread.ai（目录/正文/状态/ETA），直连优先、页面代理兜底，并管理缓存与预取。
- **Mermaid** 单独打包，仅在检测到图表时按需注入，控制主包体积。

## 🤝 贡献 · Contributing

欢迎 issue / PR。重大改动请先开 issue 讨论。
Issues and PRs are welcome; please open an issue first for major changes.

## 🙏 致谢 · Acknowledgments

- [zread.ai](https://zread.ai) — AI 文档生成 · AI documentation for GitHub repos.
- [Extension.js](https://extension.js.org) — MV3 + React + TS 构建框架 · build framework.

## 📄 许可 · License

[MIT](LICENSE) © 2026 ejfkdev
