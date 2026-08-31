// ui.tsx — GitHub UI 注入主控制器（精简版：目录树 + 文档内容显示）

import { createRoot, type Root } from 'react-dom/client'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { RepoInfo } from './integrator'
import { findReadmeBox, findReadmeContainer } from './integrator'
import DocPanel from './doc-panel'
import { t } from './i18n'

let docPanelRoot: Root | null = null
let docPanelContainer: HTMLElement | null = null
let toggleButton: HTMLButtonElement | null = null
let currentRepo: RepoInfo | null = null
let selectedDocSlug: string | null = null
let originalReadmeHTML: string | null = null
let loadingState = false
let mutationObserver: MutationObserver | null = null
let readmeTabElement: HTMLElement | null = null
let readmeTabOriginalClass: string = ''

const STYLE_ID = 'zread-github-styles'

// ==========================================
// 样式注入
// ==========================================
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .zread-toggle-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; font-size: 12px; font-weight: 600;
      color: #1f2328; background: #fff; border: 1px solid #d1d9e0;
      border-radius: 6px; cursor: pointer; margin-left: 8px; transition: all .15s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .zread-toggle-btn:hover { background: #f6f8fa; border-color: #1f232833; }
    .zread-toggle-btn.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }
    .zread-toggle-btn svg { width: 14px; height: 14px; }

    /* sidebar 外层，不需要定位代码，跟随 marker 定位 */
    .zread-sidebar-outer {
      width: 220px !important;
      height: calc(100vh - 70px);
      z-index: 1000 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      display: none;
    }
    .zread-sidebar-outer.visible { display: block; }

    /* 跟随 GitHub README 头部：滚动吸附时去掉圆角和顶边框 */
    .zread-sidebar.zread-stuck { border-radius: 0; border-top: none; }

    /* 零宽 marker（放在导航条最前面，定位代码在这里） */
    .zread-sidebar-marker {
      display: inline-block !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      vertical-align: middle !important;
      position: absolute !important;
      top: 0 !important;
      left: -236px !important;
    }

    /* React 渲染根容器，撑满外层高度 */
    .zread-panel-root { height: 100%; }

    /* 侧栏 */
    .zread-sidebar {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      background: #fff;
      border: 1px solid #d1d9e0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 2px 0 12px rgba(0,0,0,0.08);
      pointer-events: auto;
    }

    .zread-sidebar-header {
      padding: 0 10px; border-bottom: 1px solid #eaecef;
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      background: #f6f8fa;
      height: 47px; box-sizing: border-box; flex-wrap: nowrap;
    }
    .zread-sidebar-title { font-weight: 600; font-size: 13px; color: #1f2328; display: flex; align-items: center; gap: 5px; white-space: nowrap; flex-shrink: 0; }
    .zread-sidebar-title svg { color: #1f6feb; width: 14px; height: 14px; flex-shrink: 0; }
    .zread-sidebar-ver { font-weight: 400; font-size: 10px; color: #8b949e; white-space: nowrap; }
    .zread-sidebar-link { font-size: 11px; color: #656d76; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .zread-sidebar-link:hover { color: #0969da; text-decoration: underline; }

    .zread-tree { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 4px 20vh; }
    .zread-tree::-webkit-scrollbar { width: 8px; }
    .zread-tree::-webkit-scrollbar-thumb { background: #d1d9e0; border-radius: 4px; }

    .zread-section { margin-bottom: 4px; }
    .zread-section-title {
      font-size: 12px; font-weight: 700; color: #1f2328;
      padding: 6px 10px; cursor: pointer; user-select: none;
      display: flex; align-items: center; gap: 4px; border-radius: 6px;
    }
    .zread-section-title:hover { background: #f6f8fa; }
    .zread-section-title .zread-arrow { transition: transform .15s; font-size: 10px; color: #656d76; }
    .zread-section.collapsed .zread-arrow { transform: rotate(-90deg); }
    .zread-section.collapsed > .zread-group, .zread-section.collapsed > .zread-leaf { display: none; }

    .zread-group-title {
      font-size: 12px; font-weight: 600; color: #424a53;
      padding: 4px 10px 4px 22px; cursor: pointer; user-select: none;
      display: flex; align-items: center; gap: 4px; border-radius: 6px;
    }
    .zread-group-title:hover { background: #f6f8fa; }
    .zread-group-title .zread-arrow { transition: transform .15s; font-size: 10px; color: #656d76; }
    .zread-group.collapsed .zread-arrow { transform: rotate(-90deg); }
    .zread-group.collapsed > .zread-leaf { display: none; }

    .zread-leaf {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; color: #57606a;
      padding: 5px 10px; padding-left: calc(20px + var(--depth, 0) * 12px);
      cursor: pointer; border-radius: 6px; text-decoration: none;
      word-break: break-word; position: relative;
    }
    .zread-leaf svg { flex-shrink: 0; opacity: .6; }
    .zread-leaf:hover { background: rgba(129,139,152,.15); color: #1f2328; }
    .zread-leaf.selected { background: rgba(31,111,235,.1); color: #1f6feb; font-weight: 600; }
    .zread-leaf.selected::before {
      content: ""; position: absolute; left: 6px; top: 6px; bottom: 6px;
      width: 3px; background: #1f6feb; border-radius: 3px;
    }

    .zread-sidebar-empty, .zread-sidebar-loading, .zread-sidebar-error {
      padding: 24px 14px; text-align: center; color: #656d76; font-size: 13px;
    }
    .zread-sidebar-error { color: #cf222e; }
    .zread-sidebar-indexing {
      padding: 10px 14px;
      background: #fff8e6;
      border-bottom: 1px solid #f0e0b0;
      color: #9a6b00;
      font-size: 12px;
      line-height: 1.5;
    }

    .zread-sidebar-cf {
      padding: 16px 14px; text-align: center; font-size: 13px;
      color: #656d76; line-height: 1.6;
    }
    .zread-sidebar-cf p { margin: 0 0 8px; }
    .zread-cf-open-btn {
      display: inline-block; margin-top: 4px; padding: 6px 14px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      color: #fff; background: #1f6feb; border: 1px solid #1f6feb;
      border-radius: 6px;
    }
    .zread-cf-open-btn:hover { background: #1a60d2; }

    .zread-readme-loading {
      padding: 40px; text-align: center; color: #656d76; font-size: 14px;
    }
    .zread-readme-loading .zread-spinner {
      display: inline-block; width: 18px; height: 18px;
      border: 2px solid #d1d9e0; border-top-color: #1f6feb;
      border-radius: 50%; animation: zread-spin .6s linear infinite;
      vertical-align: middle; margin-right: 8px;
    }
    @keyframes zread-spin { to { transform: rotate(360deg); } }

    /* 代码块复制按钮（仿 GitHub 原生风格） */
    .zread-code-wrap {
      position: relative;
    }
    .zread-code-copy {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: rgba(246, 248, 250, 0.8);
      border: 1px solid #d0d7de;
      border-radius: 6px;
      cursor: pointer;
      color: #57606a;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
      z-index: 10;
    }
    .zread-code-wrap:hover .zread-code-copy,
    .zread-code-copy:focus {
      opacity: 1;
    }
    .zread-code-copy:hover {
      background: #f3f4f6;
      color: #1f2328;
    }
    .zread-code-copy svg {
      width: 16px;
      height: 16px;
    }
    .zread-code-copy.copied {
      opacity: 1;
      color: #1a7f37;
    }
    .zread-code-copy.copied svg {
      color: #1a7f37;
    }

    /* ============ 跟随系统暗色模式 ============ */
    @media (prefers-color-scheme: dark) {
      .zread-toggle-btn { color: #e6edf3; background: #21262d; border-color: #30363d; }
      .zread-toggle-btn:hover { background: #30363d; }
      .zread-toggle-btn.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }

      .zread-sidebar {
        background: #0d1117; border-color: #30363d;
        box-shadow: 2px 0 12px rgba(0,0,0,0.4);
      }
      .zread-sidebar-header { background: #161b22; border-bottom-color: #21262d; }
      .zread-sidebar-title { color: #e6edf3; }
      .zread-sidebar-title svg { color: #4493f8; }
      .zread-sidebar-ver { color: #7d8590; }
      .zread-sidebar-link { color: #8b949e; }
      .zread-sidebar-link:hover { color: #58a6ff; }

      .zread-tree::-webkit-scrollbar-thumb { background: #30363d; }

      .zread-section-title { color: #e6edf3; }
      .zread-section-title:hover { background: #161b22; }
      .zread-section-title .zread-arrow { color: #8b949e; }
      .zread-group-title { color: #b1bac4; }
      .zread-group-title:hover { background: #161b22; }
      .zread-group-title .zread-arrow { color: #8b949e; }

      .zread-leaf { color: #8b949e; }
      .zread-leaf:hover { background: rgba(177,186,196,.12); color: #e6edf3; }
      .zread-leaf.selected { background: rgba(56,139,253,.15); color: #58a6ff; }
      .zread-leaf.selected::before { background: #4493f8; }

      .zread-sidebar-empty, .zread-sidebar-loading { color: #8b949e; }
      .zread-sidebar-error { color: #f85149; }
      .zread-sidebar-indexing { background: #2a2008; border-bottom-color: #4d3800; color: #d29922; }
      .zread-sidebar-cf { color: #8b949e; }

      .zread-readme-loading { color: #8b949e; }
      .zread-readme-loading .zread-spinner { border-color: #30363d; border-top-color: #4493f8; }

      .zread-code-copy { background: rgba(22,27,34,.8); border-color: #30363d; color: #8b949e; }
      .zread-code-copy:hover { background: #161b22; color: #e6edf3; }
      .zread-code-copy.copied { color: #3fb950; }
      .zread-code-copy.copied svg { color: #3fb950; }
    }
  `
  document.head.appendChild(style)
}

// ==========================================
// 工具函数
// ==========================================
function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, '').trim()
}

function fixRelativeLinks(html: string, baseUrl: string): string {
  return html.replace(/href="([^"]*)"/g, (m, href) => {
    if (/^(https?:|mailto:|tel:|#)/.test(href)) return m
    const hashIdx = href.indexOf('#')
    let path = href, hash = ''
    if (hashIdx !== -1) { path = href.slice(0, hashIdx); hash = href.slice(hashIdx) }
    const clean = path.replace(/^\//, '')
    return `href="${baseUrl}/${clean}${hash}"`
  })
}

function escapeHtml(s: string): string {
  const d = document.createElement('div')
  d.textContent = String(s ?? '')
  return d.innerHTML
}

// ==========================================
// README 标签页管理
// ==========================================

// 查找 README 标签页元素
function findReadmeTab(): HTMLElement | null {
  // 方式1: 查找 UnderlineItem 类名的链接，文本为 README 或 README.md
  const tabs = document.querySelectorAll('a[class*="UnderlineItem"], button[class*="UnderlineItem"]')
  for (const tab of tabs) {
    const text = tab.textContent?.trim() || ''
    if (text === 'README' || text === 'README.md') {
      return tab as HTMLElement
    }
  }
  
  // 方式2: 查找 aria-current="page" 且文本为 README 的链接
  const currentPageLinks = document.querySelectorAll('a[aria-current="page"]')
  for (const link of currentPageLinks) {
    const text = link.textContent?.trim() || ''
    if (text === 'README' || text === 'README.md') {
      return link as HTMLElement
    }
  }
  
  return null
}

// 绑定 README 标签页点击事件（使用 document 级别的事件委托，在捕获阶段拦截）
function bindReadmeTabClickHandler() {
  console.log('[zread-ext] bindReadmeTabClickHandler: setting up event listener')
  
  // 使用 document 级别的事件监听器，在捕获阶段拦截点击事件
  // 这样可以在 React 的事件系统之前拦截
  document.addEventListener('click', handleDocumentClick, true) // 使用捕获阶段
}

// Document 级别的点击事件处理器（捕获阶段）
function handleDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  // 查找最近的 tab 元素（向上查找）
  let tabElement = target
  while (tabElement && tabElement !== document.body) {
    const text = tabElement.textContent?.trim() || ''
    const className = tabElement.className || ''
    
    // 检查是否是 README 标签页
    if ((text === 'README' || text === 'README.md') && 
        (className.includes('UnderlineItem') || tabElement.tagName === 'A')) {
      console.log('[zread-ext] README tab clicked, selectedDocSlug:', selectedDocSlug)
      
      // 如果当前是 Zread 模式，恢复 README
      if (selectedDocSlug !== null) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        
        // 立即恢复 README 内容（但不关闭侧边栏）
        restoreReadme()
        
        console.log('[zread-ext] README restored (immediate)')
        
        // 短窗口守护：若 GitHub 重渲染覆盖了恢复结果，自动重新应用
        guardReadmeRestore()
        
        return false
      }
      break
    }
    
    tabElement = tabElement.parentElement as HTMLElement
  }
}

// 恢复 README 后的短窗口守护：
// GitHub 可能在恢复后继续重渲染并覆盖内容，用 MutationObserver
// 在有限时间内检测覆盖并重新应用，替代多个固定延时重试（避免竞态）。
let readmeRestoreGuard: MutationObserver | null = null
function guardReadmeRestore(durationMs = 1500) {
  if (readmeRestoreGuard) {
    readmeRestoreGuard.disconnect()
    readmeRestoreGuard = null
  }
  const container = findReadmeContainer()
  const watchRoot = container?.parentElement || document.body
  const deadline = Date.now() + durationMs

  const reapply = () => {
    if (Date.now() > deadline || selectedDocSlug !== null || originalReadmeHTML === null) {
      readmeRestoreGuard?.disconnect()
      readmeRestoreGuard = null
      return
    }
    const c = findReadmeContainer()
    if (c && c.innerHTML !== originalReadmeHTML) {
      console.log('[zread-ext] Re-applying README restore (guard)')
      c.innerHTML = originalReadmeHTML
    }
  }

  readmeRestoreGuard = new MutationObserver(() => {
    // 合并到下一帧处理，避免高频抖动
    requestAnimationFrame(reapply)
  })
  readmeRestoreGuard.observe(watchRoot, { childList: true, subtree: true })
  window.setTimeout(() => {
    readmeRestoreGuard?.disconnect()
    readmeRestoreGuard = null
  }, durationMs)
}

// ==========================================
// 加载并显示文档
// ==========================================
async function loadDoc(slug: string) {
  if (!currentRepo || selectedDocSlug === slug || loadingState) return
  loadingState = true
  selectedDocSlug = slug
  console.log('[zread-ext] loadDoc:', slug)

  // 更新选中态
  docPanelContainer?.querySelectorAll('.zread-leaf').forEach((el) => {
    el.classList.toggle('selected', el.getAttribute('data-slug') === slug)
  })

  const container = findReadmeContainer()
  if (!container) { loadingState = false; return }

  // 备份原始 README
  if (originalReadmeHTML === null) {
    originalReadmeHTML = container.innerHTML
  }

  // 显示 loading
  container.innerHTML = `<div class="zread-readme-loading"><span class="zread-spinner"></span>${t('loadingDoc')}</div>`

  try {
    const response = await new Promise<{ page?: { markdown?: string }; error?: string }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'zreadReadPage', repo: `${currentRepo!.owner}/${currentRepo!.repo}`, slug },
        (res) => resolve(res as { page?: { markdown?: string }; error?: string })
      )
    })
    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message)
    if (response?.error === 'CF_CHALLENGE') throw new Error('CF_CHALLENGE')
    if (response?.error) throw new Error(response.error)

    let markdown = response?.page?.markdown || ''
    markdown = stripFrontMatter(markdown)

    // 用 marked 转 HTML
    const rawHtml = await marked.parse(markdown)
    const baseUrl = `https://zread.ai/${currentRepo!.owner}/${currentRepo!.repo}`
    const fixedHtml = fixRelativeLinks(rawHtml, baseUrl)
    // 净化
    const safeHtml = DOMPurify.sanitize(fixedHtml, { ADD_ATTR: ['target'] })

    // 直接将文档 HTML 放入 markdown-body 容器（复用 GitHub 自带的 markdown 样式）
    container.innerHTML = safeHtml

    // 渲染 mermaid 图表（在加复制按钮前，避免给图表块加按钮）
    await renderMermaidBlocks(container)

    // 给代码块添加复制按钮（仿 GitHub 原生风格）
    addCodeCopyButtons(container)
  } catch (err) {
    console.error('[zread-ext] loadDoc error:', err)
    if (err instanceof Error && err.message === 'CF_CHALLENGE') {
      container.innerHTML =
        `<div class="zread-readme-loading" style="color:#656d76">` +
        `${t('cfShort')}<br><br>` +
        `<button class="zread-cf-open-btn">${t('cfBtn')}</button></div>`
      container.querySelector('.zread-cf-open-btn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'zreadOpenSite' }, () => {})
      })
    } else {
      container.innerHTML = `<div class="zread-readme-loading" style="color:#cf222e">${t('loadFail')}${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}</div>`
    }
  } finally {
    loadingState = false
  }
}

// 文档内链接点击：仅拦截指向当前仓库的 zread.ai 文档链接，在扩展内跳转。
// 相对链接已在 fixRelativeLinks 阶段重写为 https://zread.ai/... 绝对地址。
function handleDocLinkClick(e: MouseEvent) {
  if (!currentRepo) return
  // 中键 / 修饰键点击：交给浏览器在新标签打开
  if (e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const link = (e.target as HTMLElement).closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  const m = href.match(/^https:\/\/zread\.ai\/([^/]+\/[^/]+)\/(.+?)(?:#|$)/)
  if (!m) return
  const repoPrefix = `${currentRepo.owner}/${currentRepo.repo}`.toLowerCase()
  if (m[1].toLowerCase() !== repoPrefix) return
  e.preventDefault()
  loadDoc(m[2])
}

// ==========================================
// 给代码块添加复制按钮（仿 GitHub 原生风格）
// ==========================================
const COPY_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>`
const CHECK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>`

// 把 mermaid 代码块转成 <div class="mermaid">，并通知后台按需注入独立 mermaid 渲染器。
// mermaid 体积大，不进主 content script；仅在检测到图表时才加载（分包）。
async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const codeNodes = Array.from(
    container.querySelectorAll('pre code.language-mermaid, pre code.lang-mermaid')
  ) as HTMLElement[]
  if (codeNodes.length === 0) return

  let count = 0
  for (const code of codeNodes) {
    const pre = code.closest('pre')
    if (!pre) continue
    const div = document.createElement('div')
    div.className = 'mermaid'
    div.textContent = code.textContent || ''
    pre.replaceWith(div)
    count++
  }
  if (count === 0) return

  // 通知后台注入 mermaid 渲染器（executeScript files，绕过页面 CSP）
  try {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'zreadRenderMermaid' }, () => resolve())
    })
  } catch (e) {
    console.log('[zread-ext] mermaid inject failed, keep code blocks:', e)
  }
}

function addCodeCopyButtons(container: HTMLElement) {
  const preBlocks = container.querySelectorAll('pre')
  for (const pre of preBlocks) {
    // 跳过已经被处理过的
    if (pre.parentElement?.classList.contains('zread-code-wrap')) continue

    // 创建包裹容器
    const wrap = document.createElement('div')
    wrap.className = 'zread-code-wrap'

    // 将 pre 移到包裹中（保留原位置）
    pre.parentElement?.insertBefore(wrap, pre)
    wrap.appendChild(pre)

    // 创建复制按钮
    const btn = document.createElement('button')
    btn.className = 'zread-code-copy'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Copy code')
    btn.innerHTML = COPY_ICON_SVG

    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const codeText = pre.textContent || ''
      try {
        await navigator.clipboard.writeText(codeText)
        // 显示已复制状态
        btn.classList.add('copied')
        btn.innerHTML = CHECK_ICON_SVG
        btn.setAttribute('aria-label', 'Copied')
        setTimeout(() => {
          btn.classList.remove('copied')
          btn.innerHTML = COPY_ICON_SVG
          btn.setAttribute('aria-label', 'Copy code')
        }, 1500)
      } catch (err) {
        console.error('[zread-ext] copy failed:', err)
      }
    })

    wrap.appendChild(btn)
  }
}

// ==========================================
// 恢复原始 README
// ==========================================
function restoreReadme() {
  selectedDocSlug = null
  const container = findReadmeContainer()
  if (container && originalReadmeHTML !== null) {
    container.innerHTML = originalReadmeHTML
  }
  docPanelContainer?.querySelectorAll('.zread-leaf.selected').forEach((el) => {
    el.classList.remove('selected')
  })
}

// ==========================================
// 查找主内容容器（用于推移）
// ==========================================
function findMainContentContainer(): HTMLElement | null {
  // 优先找 PageLayout-Content 类
  const pageContent = document.querySelector('[class*="PageLayout-Content"]') as HTMLElement
  if (pageContent) return pageContent
  // 回退到 main 标签
  return document.querySelector('main') || null
}

// ==========================================
// 切换侧栏显隐
// ==========================================
function toggleSidebar() {
  if (!docPanelContainer) return
  const outer = docPanelContainer.parentElement as HTMLElement
  if (!outer) return
  const visible = outer.classList.toggle('visible')
  if (toggleButton) toggleButton.classList.toggle('active', visible)
  
  if (!visible) restoreReadme()
}

// ==========================================
// 构建侧栏容器（absolute 定位，相对于 marker 向左偏移）
// ==========================================
let sidebarOuter: HTMLElement | null = null
let sidebarMarker: HTMLElement | null = null

function buildSidebar(marker?: HTMLElement) {
  if (docPanelContainer && docPanelContainer.isConnected) return
  
  // marker 由 buildToggleButton 传入
  if (!marker) return
  
  sidebarMarker = marker
  console.log('[zread-ext] buildSidebar: using marker')

  // 创建 absolute 定位的 sidebar 外层（相对于 marker 定位）
  // 默认添加 visible 类，让侧边栏自动打开
  sidebarOuter = document.createElement('div')
  sidebarOuter.className = 'zread-sidebar-outer visible'

  // 创建内容容器（渲染 React 组件），高度撑满外层以便内部滚动
  docPanelContainer = document.createElement('div')
  docPanelContainer.className = 'zread-panel-root'
  sidebarOuter.appendChild(docPanelContainer)

  // 挂到 marker 里（absolute 定位相对于 marker）
  marker.appendChild(sidebarOuter)
  console.log('[zread-ext] buildSidebar: appended sidebar to marker (auto-visible)')

  // 设置 toggle 按钮为 active 状态
  if (toggleButton) {
    toggleButton.classList.add('active')
  }

  if (currentRepo) {
    docPanelRoot = createRoot(docPanelContainer)
    docPanelRoot.render(
      <DocPanel
        repo={`${currentRepo.owner}/${currentRepo.repo}`}
        onDocClick={loadDoc}
      />
    )
  }

  setupScrollSync()
}

// ==========================================
// 滚动/尺寸联动：
//  1) 外框高度始终占满到视口底部（去掉底部空隙）
//  2) GitHub README 头部滚动吸附变直角时，侧栏同步去圆角
// ==========================================
let scrollSyncAttached = false
function setupScrollSync() {
  if (scrollSyncAttached) return
  scrollSyncAttached = true
  const run = () => requestAnimationFrame(syncSidebarFrame)
  window.addEventListener('scroll', run, { passive: true })
  window.addEventListener('resize', run)
  syncSidebarFrame()
}

function syncSidebarFrame() {
  if (!sidebarOuter || !sidebarOuter.isConnected) return

  // 1) 占满到视口底部
  const top = sidebarOuter.getBoundingClientRect().top
  const h = window.innerHeight - top
  if (h > 240) sidebarOuter.style.height = `${h}px`

  // 2) 吸附检测
  let stuck = window.scrollY > 4
  const nav = sidebarMarker?.parentElement
  if (nav) {
    const cs = getComputedStyle(nav)
    if (cs.position === 'sticky') {
      const stickyTop = parseFloat(cs.top) || 0
      stuck = nav.getBoundingClientRect().top <= stickyTop + 1
    }
  }
  const panel = docPanelContainer?.firstElementChild as HTMLElement | null
  panel?.classList.toggle('zread-stuck', stuck)
}

// ==========================================
// 构建切换按钮 + sidebar marker
// ==========================================
function buildToggleButton() {
  if (toggleButton && toggleButton.isConnected) return
  const box = findReadmeBox()
  if (!box) return

  // 找到 header 元素（用于插入按钮和 marker）
  let headerEl =
    box.querySelector('[class*="Heading"], [class*="Box-header"], h2, h3') ||
    document.querySelector('[class*="Box-header"]')

  if (!headerEl || !headerEl.parentElement) {
    // 回退：创建 toolbar
    const toolbar = document.createElement('div')
    toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:8px 16px;border-bottom:1px solid #eaecef;'
    headerEl = toolbar
    box.insertBefore(toolbar, box.firstChild)
  }

  // 1. 创建零宽 marker div（放在导航条最前面，用于确定水平位置）
  const marker = document.createElement('div')
  marker.className = 'zread-sidebar-marker'
  marker.style.cssText = 'display:inline-block;width:0;height:0;overflow:visible;vertical-align:middle;position:relative;'
  
  // 2. 创建 toggle 按钮
  toggleButton = document.createElement('button')
  toggleButton.className = 'zread-toggle-btn'
  toggleButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <span>${t('title')}</span>
  `
  toggleButton.addEventListener('click', toggleSidebar)

  // 3. 先插入 marker 到导航条最前面（作为第一个子元素）
  const parent = headerEl.parentElement
  if (!parent) return
  parent.insertBefore(marker, parent.firstChild)
  // 再追加按钮到导航条最后
  parent.appendChild(toggleButton)

  // 4. 构建 sidebar，放在 marker 里
  buildSidebar(marker)
}

// ==========================================
// 主入口
// ==========================================
const GitHubUI = {
  init(repoInfo: RepoInfo) {
    console.log('[zread-ext] GitHubUI.init:', repoInfo)
    currentRepo = repoInfo

    injectStyles()

    // 文档内 zread 链接拦截：document 级只注册一次
    document.addEventListener('click', handleDocLinkClick)

    // MutationObserver：GitHub SPA 重渲染会移除注入元素，自动恢复
    mutationObserver = new MutationObserver(() => {
      // 检查按钮或 marker 是否被移除
      if ((toggleButton && !toggleButton.isConnected) || 
          (sidebarMarker && !sidebarMarker.isConnected)) {
        if (docPanelRoot) {
          docPanelRoot.unmount()
          docPanelRoot = null
        }
        toggleButton = null
        sidebarMarker = null
        sidebarOuter = null
        docPanelContainer = null
      }
      
      // 重新创建
      if (!toggleButton) {
        buildToggleButton()
      }
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    // 初始构建（buildToggleButton 内部会调用 buildSidebar）
    buildToggleButton()
    // 延迟绑定 README 标签页点击事件
    setTimeout(() => bindReadmeTabClickHandler(), 1500)
  },

  cleanup() {
    if (mutationObserver) {
      mutationObserver.disconnect()
      mutationObserver = null
    }
    if (docPanelRoot) {
      docPanelRoot.unmount()
      docPanelRoot = null
    }
    if (sidebarOuter) {
      sidebarOuter.remove()
      sidebarOuter = null
    }
    if (sidebarMarker) {
      sidebarMarker.remove()
      sidebarMarker = null
    }
    docPanelContainer = null
    
    if (toggleButton) {
      toggleButton.remove()
      toggleButton = null
    }
    // 恢复原始 README
    if (originalReadmeHTML !== null) {
      const container = findReadmeContainer()
      if (container) container.innerHTML = originalReadmeHTML
    }
    originalReadmeHTML = null
    selectedDocSlug = null
    currentRepo = null
    
    // 移除 document 级别的点击事件监听器
    document.removeEventListener('click', handleDocumentClick, true)
    document.removeEventListener('click', handleDocLinkClick)

    const style = document.getElementById(STYLE_ID)
    if (style) style.remove()
  },
}

export default GitHubUI
