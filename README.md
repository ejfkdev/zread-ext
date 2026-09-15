# Zread Docs for GitHub

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4c9a52)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-f5c542)
![Version](https://img.shields.io/badge/version-0.1.7-informational)
[![Built with ZCode](https://img.shields.io/badge/Built%20with%20ZCode-000000.svg?style=flat&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMTgiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjU2IDIxOCI+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTEzNC40IDAuMTMwMTUyTDExNi40OCAyNS42MDIyQzExMy42NjUgMjkuNTY5OSAxMDkuMDU0IDMyLjAwMTkgMTA0LjA2NCAzMi4wMDE5SDYuMzk5OVYwQzYuMzk5OSAwLjEzMDE0OSAxMzQuNCAwLjEzMDE1MiAxMzQuNCAwLjEzMDE1MloiLz48cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNMjU2IDAuMTMwMTI3TDEwMi40MDEgMjE3LjczMkgwTDE1My41OTkgMC4xMzAxMjdIMjU2WiIvPjxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMjEuNjAxIDIxNy43MzJMMTM5LjY1IDE5Mi4xMzRDMTQyLjQ2NSAxODguMTY2IDE0Ny4wNzYgMTg1LjczNCAxNTIuMDY3IDE4NS43MzRIMjQ5LjYwNFYyMTcuNzM2SDEyMS42MDFWMjE3LjczMloiLz48L3N2Zz4=)](https://zcode.z.ai/)

**中文** · [English](#english)

在 GitHub 仓库页直接阅读 [zread.ai](https://zread.ai) 的 AI 文档：左侧生成文档目录，点击即在 README 区域阅读，无需切换标签。

**安装**：[Chrome 应用商店 — Zread Docs for GitHub](https://chromewebstore.google.com/detail/zread-docs-for-github/cjmlghhnknebnclkipbanfppgadcepaj)（或按下文从源码构建加载）。

---

## ✨ 功能

- 📚 **目录侧栏**：仓库页左侧显示 zread 文档目录（可折叠 section/group），点击在 README 区域阅读。
- 🔁 **README 切换**：点击 GitHub 原生 `README` 标签恢复原始内容。
- ⚡ **缓存 + 预取**：目录/文档本地缓存（≤50MB、LRU），后台串行预取，二次打开秒开。
- 🤖 **自动收录/刷新**：未收录自动提交并显示排队 ETA；收录超 7 天自动刷新；刷新中仍展示旧文档。
- 🧩 **代码复制**：为渲染的代码块添加仿 GitHub 的复制按钮。
- 📊 **Mermaid 图表**：渲染流程图，支持全屏预览（缩放/拖动/重置），按需分包加载；语法错误的图表回退显示源码。
- 🧭 **页内导航**：文档右侧进度轨 + 悬停目录卡片，跟随滚动、点击跳转章节。
- 🕶️ **无打扰**：全程不创建可见标签页；后台请求被拦截时使用屏幕外窗口兜底。
- 🔒 **隐私**：只与 github.com / zread.ai 通信，无统计无追踪，见 [隐私政策](PRIVACY.md)。
- 🌙 **暗色模式**：跟随系统 `prefers-color-scheme`。
- 🌐 **国际化**：浏览器为中文时显示中文，否则英文（界面与内容均跟随）。

## 🚀 开始

**要求**：Bun ≥ 1.4（构建链经系统 Node ≥ 22.12 运行），Chrome（开发者模式）。

```bash
bun install      # 安装依赖（全局共享缓存 + APFS clone，不重复下载）
bun run dev      # 开发：自动打开带扩展的 Chrome
bun run build    # 构建到 dist/chromium
```

**加载到 Chrome**

1. 打开 `chrome://extensions`，开启 **开发者模式**。
2. 点击 **加载已解压的扩展程序**，选择 `dist/chromium`。
3. 打开任意仓库页，如 `https://github.com/owner/repo`（带/不带尾斜杠均可）。

## 🧩 原理简述

- **Content script**：在 GitHub 仓库页注入左侧目录，复用 README 容器渲染文档。
- **Service worker**：请求 zread.ai（目录/正文/状态/ETA）；直连优先（携带 Cloudflare 许可 cookie），必要时以屏幕外窗口兜底；管理缓存与预取。
- **Mermaid**：单独打包，仅在检测到图表时按需注入，控制主包体积。

## 🤝 贡献

欢迎 issue / PR；重大改动请先开 issue 讨论。

## 🙏 致谢

- [zread.ai](https://zread.ai) — GitHub 仓库 AI 文档生成。
- [Extension.js](https://extension.js.org) — MV3 + React + TS 构建框架。

## 📄 许可

[MIT](LICENSE) © 2026 ejfkdev

---

# English

Read [zread.ai](https://zread.ai) AI-generated documentation right on any GitHub repository page: a documentation sidebar appears beside the README, and clicking an entry renders the doc in the README area — no tab switching.

**Install**: [Chrome Web Store — Zread Docs for GitHub](https://chromewebstore.google.com/detail/zread-docs-for-github/cjmlghhnknebnclkipbanfppgadcepaj) (or build & load from source below).

## ✨ Features

- 📚 **TOC sidebar**: collapsible section/group table of contents on the repo page, read in the README area.
- 🔁 **Restore README**: click the native `README` tab to bring back the original content.
- ⚡ **Cache & prefetch**: local LRU cache (≤50MB) with background serial prefetch for instant re-open.
- 🤖 **Auto index & refresh**: auto-submit unlisted repos (with queue ETA), auto-refresh after 7 days, keep showing old docs while refreshing.
- 🧩 **Copy code**: GitHub-style copy button on rendered code blocks.
- 📊 **Mermaid**: renders diagrams with a fullscreen viewer (zoom/pan/reset), loaded on demand; syntax-broken diagrams fall back to source code.
- 🧭 **In-page navigation**: section progress rail + hover table-of-contents card on the right, scroll-aware with click-to-jump.
- 🕶️ **Unobtrusive**: never opens visible tabs; an off-screen window is used only as a last-resort fetch context.
- 🔒 **Privacy**: talks only to github.com / zread.ai, no analytics or tracking — see [Privacy Policy](PRIVACY.md).
- 🌙 **Dark mode**: follows system `prefers-color-scheme`.
- 🌐 **i18n**: Chinese only when the browser language is Chinese, otherwise English (UI + content).

## 🚀 Getting Started

**Requirements**: Bun ≥ 1.4 (the build chain runs via system Node ≥ 22.12), Chrome with Developer mode.

```bash
bun install      # deps via shared global cache (APFS clones, no repeated downloads)
bun run dev      # launches Chrome with the extension
bun run build    # builds to dist/chromium
```

**Load unpacked**

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `dist/chromium`.
3. Open any repo page, e.g. `https://github.com/owner/repo` (trailing slash optional).

## 🧩 How it works

- **Content script**: injects the sidebar on GitHub repo pages and renders docs into the README container.
- **Service worker**: fetches zread.ai (outline/content/status/ETA); direct-first (with the Cloudflare clearance cookie), off-screen window as last resort; manages cache & prefetch.
- **Mermaid**: bundled separately and injected only when a diagram is present, keeping the main bundle small.

## 🤝 Contributing

Issues and PRs are welcome; please open an issue first for major changes.

## 🙏 Acknowledgments

- [zread.ai](https://zread.ai) — AI documentation for GitHub repositories.
- [Extension.js](https://extension.js.org) — MV3 + React + TS build framework.

## 📄 License

[MIT](LICENSE) © 2026 ejfkdev
