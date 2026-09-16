# Chrome Web Store Listing — Zread Docs for GitHub

> Last Updated: 2026-09-12

## Store Listing

**Extension Name** [REQUIRED]
Zread Docs for GitHub

**Short Description** [REQUIRED]
Read AI-generated Zread documentation for any GitHub repository without leaving the repo page.

**Detailed Description** [REQUIRED]

Zread Docs for GitHub brings the Zread.ai documentation of a repository directly into the repository page you are already reading.

When you open a GitHub repository, a documentation sidebar appears beside the README with the full table of contents of the Zread wiki for that repository: sections, groups and pages in one tree. Click any entry and the document renders right inside the README area, reusing GitHub's own typography, code highlighting and copy buttons. Diagrams in the documents are rendered inline, with a fullscreen zoomable viewer, and a slim progress rail on the right tracks the section you are reading and jumps to any heading on click.

How to use it:
1. Install the extension and open any GitHub repository home page.
2. The sidebar loads the repository's Zread documentation automatically (interface and content follow your browser language, Chinese or English).
3. Browse the tree, click a page to read it in place, or use the "Zread 文档 / Zread Docs" button in the README header to toggle the sidebar.
4. Repositories that are not indexed yet can be submitted for indexing with one click from the sidebar; already-indexed repositories whose docs went stale are refreshed automatically.

Privacy and permissions in one paragraph: the extension only talks to github.com (to show its interface) and zread.ai (to fetch documentation). It reads your zread.ai login cookie solely to authenticate documentation requests when you are logged in, caches documents locally on your device for speed, and sends nothing anywhere else. No analytics, no tracking, no ads. Full policy: https://github.com/ejfkdev/zread-ext/blob/main/PRIVACY.md

Feedback and issues: https://github.com/ejfkdev/zread-ext/issues

---

Zread Docs for GitHub 把仓库的 Zread.ai 文档直接带到你正在浏览的 GitHub 仓库页里。

打开仓库主页后，README 旁会出现文档侧栏，以树状目录展示该仓库在 Zread 上的全部文档（章节 / 分组 / 页面）。点击任意条目，文档直接在 README 区域渲染，复用 GitHub 自带的排版、代码高亮与复制按钮；文档中的图表会内联渲染并支持全屏缩放查看；右侧的进度轨跟随阅读位置，点击可跳转到对应章节。

使用方法：安装后打开任意 GitHub 仓库主页，侧栏自动加载该仓库的 Zread 文档（界面与内容跟随浏览器语言，中文或英文）；点击目录在页内阅读，或用 README 头部的「Zread 文档」按钮开关侧栏；未收录的仓库可在侧栏一键提交收录，已收录但过期的文档会自动刷新。

隐私说明：扩展只与 github.com（显示界面）和 zread.ai（获取文档）通信；仅在你登录 zread.ai 时读取该站登录 cookie 用于文档请求鉴权；文档缓存在本机以提升速度；不含任何统计、追踪或广告。完整隐私政策见上方链接。

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Displays the Zread.ai documentation of the GitHub repository you are viewing inside the repository page.

**Primary Language** [REQUIRED]
English (Chinese localization included; UI and fetched content follow browser language)

## Graphics & Assets

<!-- Store assets live in release/store-assets, which is git-ignored: they are local
     publishing artifacts, not part of the public repository. -->

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | release/store-assets/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | release/store-assets/screenshot-1280x800.png (.jpg) |
| Screenshot 2 [RECOMMENDED] | 1280×800 | 🟡 Needs update (optional: dark-mode or fullscreen-diagram shot) | — |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | release/store-assets/promo-440x280.jpg |
| Marquee Promo Tile | 1400×560 | ✅ Ready | release/store-assets/promo-1400x560.jpg |

### Screenshot Notes
Screenshot 1 (2026-09-12, light mode, trycua/cua): GitHub repo page with the documentation
sidebar open on the left, a rendered document in the README area, and the section progress
rail on the right. Capture at 1280×800 exactly (CWS rejects other sizes).

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| cookies | permissions | Reads the user's zread.ai login cookie (only when logged in) so documentation requests to zread.ai are authenticated as the user; the cookie value is sent only to zread.ai. |
| scripting | permissions | Inserts the documentation sidebar and doc renderer into github.com repository pages (the extension's only UI), and injects the bundled diagram renderer when a document contains a Mermaid diagram. All injected code ships inside the extension package; nothing is fetched or executed from the network. |
| storage | permissions | Caches fetched documentation (table of contents and pages) on the device so documents open instantly and survive reloads. |
| unlimitedStorage | permissions | The documentation cache can exceed the default 5 MB storage quota (capped at ~50 MB with automatic least-recently-used eviction). |
| alarms | permissions | Schedules background pre-caching of a repository's documents so pre-fetching survives browser idle periods without keeping a page open. |
| declarativeNetRequest | permissions | Rewrites the Origin/Referer headers on the extension's own requests to zread.ai so the documentation service accepts them (the browser otherwise attaches the extension's internal origin, which the service rejects with 403). One header-modification rule scoped to zread.ai only; no blocking or redirect rules. |
| *://*.github.com/* | host_permissions | Required to show the documentation sidebar and render documents inside GitHub repository pages. |
| *://zread.ai/* | host_permissions | Required to fetch documentation content, indexing status and refreshes from the Zread documentation service. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes (limited, see table)

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | — | — | — |
| Health info | No | — | — | — |
| Financial info | No | — | — | — |
| Authentication info | Yes | Yes — to zread.ai only | The user's zread.ai session cookie authenticates documentation requests when logged in | No |
| Personal communications | No | — | — | — |
| Location | No | — | — | — |
| Web history | No | — | — | — |
| User activity | No | — | — | — |
| Website content | Yes | Yes — to zread.ai only | The repository owner/name (and document slug) of the GitHub page being viewed, to fetch the matching documentation | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/ejfkdev/zread-ext/blob/main/PRIVACY.md
(valid once the repository is pushed; keep the file at repo root so the URL never 404s)

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
ejfkdev

**Contact Email** [REQUIRED]
<!-- 提交时在 Chrome Developer Console 里手动填写；按用户要求不写入仓库文档。 -->
(fill in the Developer Console at submission time — intentionally not stored in this repository)

**Support URL / Email** [RECOMMENDED]
https://github.com/ejfkdev/zread-ext/issues

**Homepage URL** [RECOMMENDED]
https://zread.ai

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.9 | 2026-09-14 | No windows are opened in the background any more: the off-screen fetch fallback is gone. If zread.ai asks for a Cloudflare human check, the documentation panel shows a notice with a manual "Open zread.ai" button (user click). Leftover background windows from earlier versions are closed automatically on startup; the `tabs` permission was dropped as unnecessary. |
| 0.1.8 | 2026-09-14 | Background fetch window no longer leaks: the singleton lookup read `win.tabs` without `populate:true` (always undefined), so every fallback created a new hidden window and left it open; now reuses/adopts an existing one and automatically closes windows left by earlier versions |
| 0.1.7 | 2026-09-13 | Off-screen fallback window no longer crashes with "Invalid value for bounds" on newer Chrome (bounds must be ≥50% on-screen): creation now falls back off-screen → minimized → default position |
| 0.1.6 | 2026-09-12 | Docs language actually follows the browser language: zread localizes by the X-Locale cookie (not just the header), so a stale cookie kept forcing Chinese — the extension now syncs that cookie to the current language before every request; polluted cache purged via cache-key bump |
| 0.1.5 | 2026-09-12 | Language switch no longer shows stale cached docs: content locale is reported by the page (web-language aware) instead of the worker's UI language, so cache keys and X-Locale follow the browser's current language |
| 0.1.4 | 2026-09-12 | Repo refresh no longer fails with 403: header-rewrite rule restores a zread.ai Origin/Referer on extension requests (was lost in the rewrite); 2xx responses without a body (e.g. 204) now count as success |
| 0.1.3 | 2026-09-12 | Hide zread front-matter metadata (e.g. "slug:1-overview blog_type:normal") that leaked into the rendered doc as a fake heading; handles CRLF/BOM/unfenced variants + DOM-level backstop |
| 0.1.2 | 2026-09-12 | Docs render with GitHub markdown styling on pages whose README container lacks the markdown-body scope (wrap injected doc) |
| 0.1.1 | 2026-09-12 | Fix in-page section rail misplacement on repos whose README is not mounted (anchor fallback + hide-and-retry) |
| 0.1.0 | 2026-09-12 | First public release: documentation sidebar + in-page doc rendering, mermaid diagrams with fullscreen viewer, in-page section progress rail, local cache, one-click indexing submit/refresh | Draft (item ID cjmlghhnknebnclkipbanfppgadcepaj; listing + privacy forms filled 2026-09-12; listing localized: en default + zh-CN; awaiting store icon + screenshots upload, then submit) |

## Review Notes

### Known Issues / Limitations
- Documentation is available only for repositories indexed by zread.ai; the sidebar offers
  one-click submission for unindexed repositories and shows queue ETA while indexing.
- If zread.ai presents a human verification challenge, the extension shows a notice with a
  button that opens zread.ai for the user to complete the check (the only user-visible tab
  the extension ever opens).
- The interface modifies the repository page layout (sidebar + README-area rendering); the
  original README can be restored at any time via the toggle button.

### Rejection History
<!-- none yet -->
