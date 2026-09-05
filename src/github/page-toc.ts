// page-toc.ts — 文档页内目录（仿 zread.ai 右侧进度轨 + 悬停卡片）
// 进度轨：fixed 在 README 卡片右侧的一列小横线，当前章节高亮（teal）；
// 悬停进度轨展开标题卡片；点击横线或标题平滑滚动到对应章节。

interface TocItem {
  id: string
  text: string
  el: HTMLElement
}

let railEl: HTMLElement | null = null
let cardEl: HTMLElement | null = null
let items: TocItem[] = []
let activeIdx = -1
let hideTimer: number | null = null
let scrollTicking = false
let removeListeners: (() => void) | null = null

const TOP_OFFSET = 96 // GitHub 顶部吸附导航高度 + 余量

function slugify(text: string, used: Set<string>): string {
  let base = text.trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
  let id = base
  let i = 2
  while (used.has(id)) id = `${base}-${i++}`
  used.add(id)
  return id
}

function collectItems(container: HTMLElement): TocItem[] {
  const used = new Set<string>()
  let heads = Array.from(container.querySelectorAll('h2')) as HTMLElement[]
  if (heads.length < 2) heads = Array.from(container.querySelectorAll('h3')) as HTMLElement[]
  if (heads.length < 2) return []
  return heads.map((el) => {
    if (!el.id) el.id = slugify(el.textContent || '', used)
    return { id: el.id, text: (el.textContent || '').trim(), el }
  })
}

function docTitle(container: HTMLElement): string {
  return (container.querySelector('h1')?.textContent || '').trim()
}

function setActive(idx: number) {
  if (idx === activeIdx) return
  activeIdx = idx
  railEl?.querySelectorAll('.zread-toc-dash').forEach((d, i) => d.classList.toggle('active', i === idx))
  cardEl?.querySelectorAll('a').forEach((a, i) => a.classList.toggle('active', i === idx))
  // 卡片打开时把激活项滚进可视区
  const link = cardEl?.querySelectorAll('a')[idx] as HTMLElement | undefined
  if (link && cardEl && cardEl.classList.contains('open')) {
    const lr = link.getBoundingClientRect()
    const cr = cardEl.getBoundingClientRect()
    if (lr.top < cr.top + 8 || lr.bottom > cr.bottom - 8) link.scrollIntoView({ block: 'nearest' })
  }
}

function computeActive() {
  let idx = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].el.getBoundingClientRect().top <= TOP_OFFSET + 24) idx = i
    else break
  }
  // 页面滚到底时高亮最后一项
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) idx = items.length - 1
  setActive(idx)
}

function onScroll() {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    scrollTicking = false
    computeActive()
    positionRail()
  })
}

function positionRail() {
  if (!railEl || !cardEl) return
  const readme = document.querySelector('article.markdown-body')
  const box = (readme?.closest('[class*="OverviewRepoFiles-module__Box_1__"]') ||
    readme?.closest('[class*="Box"]') || readme) as HTMLElement | null
  if (!box) return
  const r = box.getBoundingClientRect()
  // 水平位置：README 卡片与右栏（Packages/About 列）之间的缝隙居中；
  // 缝隙不可用（右栏换行到下方或视口太窄）时退回卡片右缘内侧
  const RAIL_W = 20
  const side = document.querySelector('[class*="Layout-main"] aside, .Layout-sidebar, [class*="RepositoryLayout"] aside, [class*="PageLayout-Pane"]') as HTMLElement | null
  const s = side ? side.getBoundingClientRect() : null
  // 右栏内容左缘（Pane 有内边距，缝隙要算到内容而不是 Pane 外框）
  const inner = (side?.querySelector('[class*="SidebarSection"]') || side?.firstElementChild) as HTMLElement | null
  let contentLeft = inner ? inner.getBoundingClientRect().left : 0
  if (!contentLeft && s) contentLeft = s.left + 24
  let x: number
  if (s && contentLeft > r.right + RAIL_W + 4 && s.top < r.bottom && s.bottom > r.top) {
    // 卡片右缘与右栏内容之间的缝隙居中
    x = r.right + (contentLeft - r.right - RAIL_W) / 2
  } else {
    // 缝隙不可用（右栏换行到下方或视口太窄）时退回卡片右缘内侧
    x = r.right - 4 - RAIL_W
  }
  x = Math.max(8, Math.min(x, window.innerWidth - RAIL_W - 8))
  railEl.style.left = `${x}px`
  cardEl.style.left = `${x + 28}px` // 卡片在轨道右侧展开
  const cramped = r.right + 70 > window.innerWidth
  railEl.classList.toggle('zread-toc-hidden', cramped)
  if (cramped) hideCard()

  // 垂直位置：跟随滚动，但限制在文档正文区域内（同左侧目录的跟随逻辑）
  // 上缘对齐 README 头部（README/Contributing 标签行）的下边缘
  const head = box.querySelector('[class*="Box-header"], [class*="UnderlineNav"]') as HTMLElement | null
  const docTop = (head ? head.getBoundingClientRect().bottom : r.top + 64) + 8
  const docBottom = r.bottom - 24
  const railTop = Math.min(docTop, docBottom - railEl.offsetHeight)
  railEl.style.top = `${railTop}px`
  const cardH = cardEl.offsetHeight || 200
  const cardTop = Math.min(railTop, docBottom - cardH)
  cardEl.style.top = `${cardTop}px`
}

function showCard() {
  if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null }
  cardEl?.classList.add('open')
  positionRail()
}

function hideCard() {
  if (hideTimer) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => cardEl?.classList.remove('open'), 180)
}

function scrollToItem(item: TocItem) {
  const top = item.el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET
  window.scrollTo({ top, behavior: 'smooth' })
}

export function buildPageToc(container: HTMLElement) {
  removePageToc()
  items = collectItems(container)
  if (items.length === 0) return

  railEl = document.createElement('div')
  railEl.className = 'zread-toc-rail'
  cardEl = document.createElement('div')
  cardEl.className = 'zread-toc-card'

  const titleText = docTitle(container)
  if (titleText) {
    const title = document.createElement('div')
    title.className = 'zread-toc-card-title'
    title.textContent = titleText
    cardEl.appendChild(title)
  }

  const list = document.createElement('div')
  list.className = 'zread-toc-card-list'
  items.forEach((item, i) => {
    const dash = document.createElement('div')
    dash.className = 'zread-toc-dash'
    dash.title = item.text
    dash.addEventListener('click', () => scrollToItem(item))
    railEl!.appendChild(dash)

    const a = document.createElement('a')
    a.href = `#${item.id}`
    a.textContent = item.text
    a.addEventListener('click', (e) => {
      e.preventDefault()
      scrollToItem(item)
    })
    a.dataset.idx = String(i)
    list.appendChild(a)
  })
  cardEl.appendChild(list)

  railEl.addEventListener('mouseenter', showCard)
  railEl.addEventListener('mouseleave', hideCard)
  cardEl.addEventListener('mouseenter', showCard)
  cardEl.addEventListener('mouseleave', hideCard)

  document.body.appendChild(railEl)
  document.body.appendChild(cardEl)

  const onResize = () => positionRail()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  removeListeners = () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
  }

  positionRail()
  computeActive()
}

export function removePageToc() {
  removeListeners?.()
  removeListeners = null
  railEl?.remove()
  cardEl?.remove()
  railEl = null
  cardEl = null
  items = []
  activeIdx = -1
  if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null }
}
