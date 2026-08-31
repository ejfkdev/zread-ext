// integrator.ts — GitHub 页面 DOM 探测工具（适配新版结构）

export interface RepoInfo {
  owner: string
  repo: string
}

// 判断是否为 GitHub 仓库主页（仅 owner/repo 根路径）
export function isGitHubRepoPage(): boolean {
  const { hostname, pathname } = window.location
  if (hostname !== 'github.com') return false
  if (pathname.includes('/settings')) return false
  if (pathname.includes('/pulls')) return false
  if (pathname.includes('/issues')) return false
  if (pathname.includes('/actions')) return false
  if (pathname.includes('/wiki')) return false
  if (pathname.includes('/blob')) return false
  if (pathname.includes('/tree/')) return false
  if (!/^\/[^/]+\/[^/]+\/?$/.test(pathname)) return false
  return true
}

// 解析 owner/repo（兼容尾斜杠）
export function parseRepoInfo(): RepoInfo | null {
  const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

// 查找 README markdown 渲染容器（要替换内容的目标元素）
// 新版 GitHub: article.markdown-body 是真正的渲染节点
export function findReadmeContainer(): HTMLElement | null {
  return (
    document.querySelector('article.markdown-body') ||
    document.querySelector('.js-snippet-clipboard-copy-unpositioned') ||
    document.querySelector('[data-testid="readme-content"]') ||
    document.querySelector('.readme article.markdown-body')
  )
}

// 查找 README 卡片外层 Box（用于注入左侧目录，与其并排）
// 新版 GitHub: article → Box_2 → Box_1；优先返回最外层 Box_1 作为完整 README 卡片
export function findReadmeBox(): HTMLElement | null {
  const md = document.querySelector('article.markdown-body')
  if (md) {
    // 向上找 Box_1（最外层卡片），其次 Box_2
    let box1: HTMLElement | null = null
    let box2: HTMLElement | null = null
    let el: HTMLElement | null = md.parentElement
    while (el && el !== document.body) {
      const cls = el.className || ''
      if (/OverviewRepoFiles-module__Box_1__/.test(cls)) box1 = el
      if (/OverviewRepoFiles-module__Box_2__/.test(cls)) box2 = el
      el = el.parentElement
    }
    if (box1) return box1
    if (box2) return box2
    return md.parentElement?.parentElement || md.parentElement
  }
  return (
    document.querySelector('[class*="OverviewRepoFiles-module__Box_1__"]') ||
    document.querySelector('[class*="OverviewRepoFiles-module__Box_2__"]') ||
    document.querySelector('[class*="OverviewRepoFiles-module"]')
  )
}
