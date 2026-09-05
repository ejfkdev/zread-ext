// mermaid-renderer.ts — 独立打包的 mermaid 渲染器（按需注入，不进主 content script）
// 由 ui.tsx 在检测到 mermaid 代码块时，后台 executeScript 注入本文件。
// 渲染图表 + 提供"全屏预览"（留边圆角面板、点击外圈/Esc 关闭、放大/缩小/拖动/重置、默认居中）。

import mermaid from 'mermaid'

function isDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

const ICON_EXPAND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>'
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>'
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
const ICON_MINUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>'
const ICON_RESET =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
const ICON_COPY =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 6.216 0 7.75 0h7.5C15.216 0 16 .784 16 1.75v7.5c0 .966-.784 1.75-1.75 1.75h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>'
const ICON_CHECK =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.28l6.72-6.72a.75.75 0 0 1 1.06 1.06Z"></path></svg>'

// 主题配色
const THEME = isDark()
  ? {
      panelBg: '#0d1117',
      panelBorder: '#30363d',
      toolbarBg: '#161b22',
      toolbarBorder: '#30363d',
      hoverBg: '#30363d',
      text: '#e6edf3',
      muted: '#8b949e',
    }
  : {
      panelBg: '#f7f6f3',
      panelBorder: '#e3e1dc',
      toolbarBg: '#ffffff',
      toolbarBorder: '#e4e4e2',
      hoverBg: '#edece8',
      text: '#1f2328',
      muted: '#8a8a86',
    }

const STYLE_ID = 'zread-mermaid-viewer-styles'
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const st = document.createElement('style')
  st.id = STYLE_ID
  st.textContent = `
    .zread-mermaid-wrap {
      position: relative;
      border: 1px solid ${isDark() ? '#30363d' : '#d8d8d4'};
      border-radius: 8px;
      background: ${isDark() ? '#0d1117' : '#fbfbfa'};
      padding: 16px;
      margin: 8px 0 16px;
      overflow: auto;
    }
    .zread-mermaid-wrap > svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .zread-mermaid-expand {
      position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(246,248,250,.9); border: 1px solid #d0d7de; border-radius: 6px;
      color: #57606a; cursor: pointer; opacity: 0; transition: opacity .15s; z-index: 5;
    }
    .zread-mermaid-wrap:hover .zread-mermaid-expand { opacity: 1; }
    .zread-mermaid-expand svg { width: 16px; height: 16px; }

    /* 全屏：外层半透明背景（点击关闭），内层留边圆角面板 */
    .zread-mm-backdrop {
      position: fixed; inset: 0; z-index: 2147483000;
      background: rgba(10,12,16,.5);
      display: flex; align-items: center; justify-content: center;
    }
    .zread-mm-panel {
      position: relative;
      width: calc(100% - 64px); height: calc(100% - 64px);
      background: ${THEME.panelBg};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,.28);
      overflow: hidden;
    }
    .zread-mm-toolbar {
      position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 4px;
      background: ${THEME.toolbarBg}; border: 1px solid ${THEME.toolbarBorder};
      border-radius: 999px; padding: 6px 10px; box-shadow: 0 2px 10px rgba(0,0,0,.12); z-index: 3;
    }
    .zread-mm-toolbar button {
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 6px; cursor: pointer;
      color: ${THEME.text};
    }
    .zread-mm-toolbar button:hover { background: ${THEME.hoverBg}; }
    .zread-mm-toolbar button svg { width: 15px; height: 15px; }
    .zread-mm-pct { min-width: 48px; text-align: center; font-size: 12px; color: ${THEME.muted}; }
    .zread-mm-close {
      position: absolute; top: 14px; right: 16px; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 8px; cursor: pointer;
      color: ${THEME.text}; z-index: 3;
    }
    .zread-mm-close:hover { background: ${THEME.hoverBg}; }
    .zread-mm-close svg { width: 18px; height: 18px; }
    .zread-mm-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; }
    .zread-mm-stage.dragging { cursor: grabbing; }
    .zread-mm-holder { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
    .zread-mm-holder svg { max-width: none; display: block; }
    .zread-mm-caption {
      position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
      font-size: 11px; letter-spacing: 2px; color: ${THEME.muted}; z-index: 3;
    }
  `
  document.head.appendChild(st)
}

// 在已渲染的 mermaid 块上加"全屏"按钮
function addExpandButton(div: HTMLElement): void {
  if (div.querySelector('.zread-mermaid-expand')) return
  div.classList.add('zread-mermaid-wrap')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'zread-mermaid-expand'
  btn.innerHTML = ICON_EXPAND
  btn.title = '全屏预览'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    openViewer(div)
  })
  div.appendChild(btn)
}

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.innerHTML = icon
  b.title = title
  return b
}

// 全屏预览：留边圆角面板，点击外圈/Esc 关闭，放大/缩小/拖动/重置，默认居中
function openViewer(sourceDiv: HTMLElement): void {
  const svg = sourceDiv.querySelector('svg')
  if (!svg) return
  ensureStyles()

  const backdrop = document.createElement('div')
  backdrop.className = 'zread-mm-backdrop'
  const panel = document.createElement('div')
  panel.className = 'zread-mm-panel'

  const toolbar = document.createElement('div')
  toolbar.className = 'zread-mm-toolbar'
  const btnMinus = mkBtn(ICON_MINUS, '缩小')
  const btnPlus = mkBtn(ICON_PLUS, '放大')
  const btnReset = mkBtn(ICON_RESET, '重置')
  const pct = document.createElement('span')
  pct.className = 'zread-mm-pct'
  toolbar.append(btnMinus, pct, btnPlus, btnReset)

  const close = document.createElement('button')
  close.className = 'zread-mm-close'
  close.innerHTML = ICON_CLOSE
  close.title = '关闭'

  const stage = document.createElement('div')
  stage.className = 'zread-mm-stage'
  const holder = document.createElement('div')
  holder.className = 'zread-mm-holder'
  const clone = svg.cloneNode(true) as SVGElement
  // 让克隆以"文档内联显示尺寸"渲染，使全屏 100% 与文档观感一致
  const ir = (svg as any).getBoundingClientRect?.()
  if (ir && ir.width > 0 && ir.height > 0) {
    clone.setAttribute('width', String(ir.width))
    clone.setAttribute('height', String(ir.height))
    ;(clone as any).style.maxWidth = 'none'
  }
  holder.appendChild(clone)
  stage.appendChild(holder)

  const caption = document.createElement('div')
  caption.className = 'zread-mm-caption'
  caption.textContent = 'MERMAID 预览'

  panel.append(toolbar, close, stage, caption)
  backdrop.appendChild(panel)
  document.body.appendChild(backdrop)

  let scale = 1
  let x = 0
  let y = 0
  const apply = () => {
    holder.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    pct.textContent = Math.round(scale * 100) + '%'
  }
  const size = () => {
    const r = (clone as any).getBoundingClientRect?.()
    // getBoundingClientRect 已含 scale，需除以 scale 还原原始尺寸
    const sw = r ? r.width / scale : 800
    const sh = r ? r.height / scale : 600
    return { sw, sh }
  }
  const centerAt = (s: number) => {
    const { sw, sh } = size()
    scale = s
    x = (stage.clientWidth - sw * scale) / 2
    y = (stage.clientHeight - sh * scale) / 2
    apply()
  }
  btnPlus.addEventListener('click', () => {
    const ns = Math.min(5, scale * 1.2)
    zoomAbout(ns)
  })
  btnMinus.addEventListener('click', () => {
    const ns = Math.max(0.2, scale / 1.2)
    zoomAbout(ns)
  })
  btnReset.addEventListener('click', () => centerAt(fitScale()))
  function zoomAbout(ns: number) {
    const cx = stage.clientWidth / 2
    const cy = stage.clientHeight / 2
    x = cx - ((cx - x) * ns) / scale
    y = cy - ((cy - y) * ns) / scale
    scale = ns
    apply()
  }
  function fitScale(): number {
    // 原始尺寸（scale=1 时测量）
    const saved = scale
    scale = 1
    const r = (clone as any).getBoundingClientRect?.()
    const sw = r ? r.width : 800
    const sh = r ? r.height : 600
    scale = saved
    // 100% 即文档内联尺寸；若超出面板则缩到适配
    return Math.min(1, (stage.clientHeight * 0.9) / sh, (stage.clientWidth * 0.9) / sw)
  }

  // 拖动平移
  let dragging = false
  let sx = 0
  let sy = 0
  stage.addEventListener('mousedown', (e) => {
    dragging = true
    stage.classList.add('dragging')
    sx = e.clientX - x
    sy = e.clientY - y
    e.preventDefault()
  })
  const onMove = (e: MouseEvent) => {
    if (!dragging) return
    x = e.clientX - sx
    y = e.clientY - sy
    apply()
  }
  const onUp = () => {
    dragging = false
    stage.classList.remove('dragging')
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  // 滚轮缩放
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    zoomAbout(Math.min(5, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9))))
  }
  stage.addEventListener('wheel', onWheel, { passive: false })

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup()
  }
  // 点击外圈（backdrop 本身）关闭
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === backdrop) cleanup()
  }
  const cleanup = () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    backdrop.removeEventListener('mousedown', onBackdrop)
    backdrop.remove()
  }
  close.addEventListener('click', cleanup)
  backdrop.addEventListener('mousedown', onBackdrop)
  window.addEventListener('keydown', onKey)

  // 默认：适配并居中
  requestAnimationFrame(() => centerAt(fitScale()))
}

// 渲染失败（图表语法错误等）时，把该块还原为源码代码块，而不是 mermaid 的错误图
// 复用 ui.tsx 注入的 .zread-code-wrap / .zread-code-copy 样式，观感与正文代码块一致
function fallbackToCode(div: HTMLElement, source: string): void {
  const wrap = document.createElement('div')
  wrap.className = 'zread-code-wrap'
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = source
  pre.appendChild(code)
  const btn = document.createElement('button')
  btn.className = 'zread-code-copy'
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Copy code')
  btn.innerHTML = ICON_COPY
  btn.addEventListener('click', async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(source)
      btn.classList.add('copied')
      btn.innerHTML = ICON_CHECK
      btn.setAttribute('aria-label', 'Copied')
      setTimeout(() => {
        btn.classList.remove('copied')
        btn.innerHTML = ICON_COPY
        btn.setAttribute('aria-label', 'Copy code')
      }, 1500)
    } catch (err) {
      console.log('[zread-ext] copy failed:', err)
    }
  })
  wrap.append(pre, btn)
  div.replaceWith(wrap)
}

// mermaid 语法错误时 run 会把节点内容替换成"错误图"（含 Syntax error 文案），用于兜底识别
function hasErrorDiagram(div: HTMLElement): boolean {
  const svg = div.querySelector('svg')
  if (!svg) return false
  return /syntax error|parse error|error in text/i.test(svg.textContent || '')
}

// 渲染当前文档内的 mermaid 块；渲染后附加全屏按钮
export async function renderMermaid(container?: HTMLElement | null): Promise<number> {
  ensureStyles()
  const root = container || document
  const divs = Array.from(root.querySelectorAll('div.mermaid:not([data-processed])')) as HTMLElement[]
  if (divs.length === 0) return 0
  mermaid.initialize({
    startOnLoad: false,
    // strict：禁用图表内点击/JS 注入，防止文档中的图表标签携带脚本（XSS）
    securityLevel: 'strict',
    theme: isDark() ? 'dark' : 'neutral',
  })
  // 先逐块 parse：语法错误的块直接显示源码，不参与渲染
  const runnable: HTMLElement[] = []
  for (const d of divs) {
    const src = d.textContent || ''
    let ok = false
    try {
      await mermaid.parse(src)
      ok = true
    } catch (e) {
      console.log('[zread-ext] mermaid parse failed, show source instead:', e)
    }
    if (ok) runnable.push(d)
    else fallbackToCode(d, src)
  }
  // 再逐块 run：parse 通过但渲染仍可能失败，同样回退源码
  for (const d of runnable) {
    const src = d.textContent || ''
    try {
      await mermaid.run({ nodes: [d] })
    } catch (e) {
      console.log('[zread-ext] mermaid run failed, show source instead:', e)
    }
    if (!d.isConnected) continue
    if (hasErrorDiagram(d)) fallbackToCode(d, src)
    else addExpandButton(d)
  }
  return divs.length
}

// 注入即渲染（executeScript files 方式），并挂到全局供后续重渲染
;(globalThis as any).__zreadRenderMermaid = renderMermaid
renderMermaid()
