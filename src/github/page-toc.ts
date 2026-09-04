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
  })
}

function positionRail() {
  if (!railEl || !cardEl) return
  const readme = document.querySelector('article.markdown-body')
  const anchor = (readme?.closest('[class*="OverviewRepoFiles-module__Box_1__"]') ||
    readme?.closest('[class*="Box"]') || readme) as HTMLElement | null
  if (!anchor) return
  const r = anchor.getBoundingClientRect()
  const x = Math.min(r.right + 24, window.innerWidth - 28)
  railEl.style.left = `${x}px`
  cardEl.style.left = `${x - 8}px`
  // 视口太窄（README 右侧放不下）时隐藏
  const cramped = r.right + 70 > window.innerWidth
  railEl.classList.toggle('zread-toc-hidden', cramped)
  if (cramped) hideCard()
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
