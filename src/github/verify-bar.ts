// verify-bar.ts — zread.ai 被 Cloudflare 拦截时，在页面顶部显示一条"信息条"提示用户手动完成验证。
// 扩展无法在浏览器 chrome（地址栏/书签栏）里绘制内容，这里用页面顶部的固定横幅等效替代：
// 全宽、贴顶、带主按钮和关闭按钮，不遮挡正文（同时给 body 留出高度）。
// 只有用户点击"打开 zread.ai"才会创建标签页（用户手势），扩展自身不再自动开任何窗口。

import { t } from './i18n'

const BAR_ID = 'zread-verify-bar'
const ON_CLASS = 'zread-verify-bar-on'
let styleInjected = false

function ensureStyle(): void {
  if (styleInjected || document.getElementById(`${BAR_ID}-style`)) return
  const style = document.createElement('style')
  style.id = `${BAR_ID}-style`
  style.textContent = `
    #${BAR_ID} {
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
      display: flex; align-items: center; gap: 10px;
      padding: 0 12px; height: 44px; box-sizing: border-box;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      background: #fff8e5; color: #3d2c00; border-bottom: 1px solid #e3c98a;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    @media (prefers-color-scheme: dark) {
      #${BAR_ID} { background: #3a2f10; color: #ffe9b3; border-bottom-color: #5c4a17; }
    }
    #${BAR_ID} .zread-vb-text { flex: 1 1 auto; min-width: 0; }
    #${BAR_ID} button {
      flex: 0 0 auto; font: inherit; cursor: pointer; border-radius: 6px;
      border: 1px solid rgba(0,0,0,.15); background: transparent; color: inherit; padding: 4px 10px;
    }
    #${BAR_ID} button.zread-vb-open {
      background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 600;
    }
    #${BAR_ID} button.zread-vb-open:hover { background: #1a5fd0; }
    #${BAR_ID} button.zread-vb-close { border: none; padding: 4px 8px; opacity: .7; }
    #${BAR_ID} button.zread-vb-close:hover { opacity: 1; }
    html.${ON_CLASS} body { margin-top: 44px !important; }
  `
  document.head.appendChild(style)
  styleInjected = true
}

export function showVerifyBar(): void {
  if (document.getElementById(BAR_ID)) return
  ensureStyle()
  const bar = document.createElement('div')
  bar.id = BAR_ID
  bar.setAttribute('role', 'status')

  const text = document.createElement('span')
  text.className = 'zread-vb-text'
  text.textContent = t('verifyBarText')

  const open = document.createElement('button')
  open.className = 'zread-vb-open'
  open.textContent = t('verifyBarOpen')
  open.addEventListener('click', () => {
    // 用户手势：允许打开一个可见标签页去过验证
    chrome.runtime.sendMessage({ type: 'zreadOpenSite' }, () => {})
  })

  const close = document.createElement('button')
  close.className = 'zread-vb-close'
  close.textContent = '✕'
  close.title = t('verifyBarDismiss')
  close.addEventListener('click', hideVerifyBar)

  bar.append(text, open, close)
  document.documentElement.appendChild(bar)
  document.documentElement.classList.add(ON_CLASS)
}

export function hideVerifyBar(): void {
  document.getElementById(BAR_ID)?.remove()
  document.documentElement.classList.remove(ON_CLASS)
}