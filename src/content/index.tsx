// content/index.tsx — content script 入口
// 检测 GitHub 仓库页面，触发 zread 文档 UI 注入

import { isGitHubRepoPage, parseRepoInfo } from '../github/integrator'
import GitHubUI from '../github/ui'
import './styles.css'

let lastPath: string | null = null
let urlObserver: MutationObserver | null = null

function init() {
  const path = window.location.pathname
  console.log('[zread-ext] content script loaded on', window.location.href)
  if (path === lastPath) return
  lastPath = path

  if (!isGitHubRepoPage()) {
    console.log('[zread-ext] not a GitHub repo page, skipping')
    GitHubUI.cleanup()
    return
  }

  const repoInfo = parseRepoInfo()
  if (!repoInfo) {
    console.log('[zread-ext] could not parse repo info')
    GitHubUI.cleanup()
    return
  }

  console.log('[zread-ext] initializing for repo:', repoInfo.owner + '/' + repoInfo.repo)
  GitHubUI.init(repoInfo)
}

// 监听 SPA 路由变化
function startObserver() {
  if (!document.body) {
    setTimeout(startObserver, 100)
    return
  }
  const check = () => {
    if (window.location.pathname !== lastPath) init()
  }
  urlObserver = new MutationObserver(check)
  urlObserver.observe(document.body, { childList: true, subtree: true })
  // 兜底：浏览器前进/后退与锚点跳转
  window.addEventListener('popstate', check)
  window.addEventListener('hashchange', check)
}

startObserver()
init()
