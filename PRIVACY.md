# Privacy Policy — Zread Docs for GitHub

Last updated: 2026-09-12

## What Data We Collect

- **Repository identifier of the page you are viewing.** When you open a GitHub repository
  page, the extension reads the repository owner/name (and, when you open a document, the
  document slug) from the page and sends it to the Zread documentation service
  (https://zread.ai) to fetch the matching documentation.
- **Your Zread session cookie (only if you are logged in to zread.ai).** The extension reads
  the `zread.ai` authentication cookie so documentation requests are made as you. It is sent
  only to `zread.ai`, never to any other destination.
- **Browser language preference.** Used to choose Chinese or English documentation and UI
  text; sent to `zread.ai` as a request header.

The extension does **not** collect personally identifiable information, health or financial
information, personal communications, location, web history, or analytics/telemetry of any
kind. It does not read your GitHub credentials or any GitHub content beyond the repository
identifier needed to fetch documentation.

## How Data Is Stored

- Fetched documentation (table of contents and page content) is cached **locally on your
  device** with `chrome.storage.local` (up to ~50 MB, least-recently-used eviction) so pages
  open instantly and repeated visits do not refetch.
- Small session-scoped state (e.g. background scheduling progress) is kept in
  `chrome.storage.session` and is cleared when the browser closes.
- Nothing is stored on any server operated by the extension developer.

## How Data Is Used

- The repository identifier is used solely to request the corresponding documentation from
  Zread and, for repositories not yet indexed, to submit an indexing request to Zread.
- The Zread session cookie is used solely to authenticate those documentation requests.
- The local cache is used solely to display documentation faster.

## Third-Party Services

- **Zread (https://zread.ai)** — the documentation service that receives the repository
  identifier and, when logged in, your Zread session cookie. See https://zread.ai for its
  own terms and privacy practices.
- No analytics, advertising, or other third-party services are used.

## Data Sharing

No data is sold or shared with any party other than Zread, as described above.

## Data Retention and Deletion

- The local documentation cache remains on your device until evicted by the size limit or
  until you remove the extension; uninstalling the extension deletes all locally stored data.
- You can also clear the extension's stored data at any time from
  `chrome://extensions` → "Zread Docs for GitHub" → details.
- Requests received by Zread are subject to Zread's own retention practices.

## Changes to This Policy

If our data practices change, this policy will be updated at the URL below and the
"Last updated" date revised. Material changes will be noted in the extension's Chrome Web
Store listing.

## Contact

Privacy questions: Ejfkdev@gmail.com
Source & issues: https://github.com/ejfkdev/zread-ext

---

# 隐私政策 — Zread Docs for GitHub（中文摘要）

最近更新：2026-09-12

- 扩展仅读取你正在浏览的 GitHub 仓库标识（owner/repo 与文档 slug），并将其发送给 Zread
  文档服务（zread.ai）以获取对应文档；若你登录了 zread.ai，才会读取该站登录 cookie 且仅
  发送给 zread.ai 用于鉴权。
- 不收集任何个人身份信息、位置、浏览历史、健康或金融信息，不含任何统计/遥测。
- 文档内容缓存在本机（chrome.storage.local，约 50MB 上限），卸载扩展即全部删除。
- 除 zread.ai 外不与任何第三方共享数据，也不出售数据。
- 隐私咨询：Ejfkdev@gmail.com
