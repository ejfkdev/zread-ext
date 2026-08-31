// doc-panel.tsx — 文档目录树 React 组件（带搜索框 + 可折叠 section/group）

import { useState, useEffect, useMemo } from 'react'
import { t, tEta } from './i18n'

export interface DocOutlineItem {
  title: string
  slug: string
  topic?: string
  group?: string
  section?: string
  order?: number
}

interface TreeNode {
  title: string
  slug: string
  level: number // 0 = section, 1 = group, 2 = topic
  children: TreeNode[]
}

interface DocPanelProps {
  repo: string
  onDocClick?: (slug: string) => void
}

// 构建三层树：section → group → item
function buildTree(items: DocOutlineItem[]): { sections: TreeNode[]; rootItems: DocOutlineItem[] } {
  const sections = new Map<string, Map<string, DocOutlineItem[]>>()
  const rootItems: DocOutlineItem[] = []

  items.forEach((item) => {
    const section = item.section || ''
    const group = item.group || ''

    if (section) {
      if (!sections.has(section)) sections.set(section, new Map())
      const groups = sections.get(section)!
      const key = group || '__nogroup__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    } else {
      rootItems.push(item)
    }
  })

  const treeSections: TreeNode[] = []
  sections.forEach((groups, sectionName) => {
    const sectionNode: TreeNode = {
      title: sectionName,
      slug: '',
      level: 0,
      children: [],
    }

    groups.forEach((groupItems, groupName) => {
      if (groupName === '__nogroup__') {
        // Items directly under section (no group)
        groupItems.forEach((item) => {
          sectionNode.children.push({
            title: item.topic || item.title,
            slug: item.slug,
            level: 1,
            children: [],
          })
        })
      } else {
        // Group with nested items
        const groupNode: TreeNode = {
          title: groupName,
          slug: '',
          level: 1,
          children: groupItems.map((item) => ({
            title: item.topic || item.title,
            slug: item.slug,
            level: 2,
            children: [],
          })),
        }
        sectionNode.children.push(groupNode)
      }
    })

    treeSections.push(sectionNode)
  })

  return { sections: treeSections, rootItems }
}

const ICON_BOOK = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const ICON_DOC = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

export default function DocPanel({ repo, onDocClick }: DocPanelProps) {
  const [outline, setOutline] = useState<DocOutlineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cfChallenge, setCfChallenge] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [eta, setEta] = useState<{ backlog: number; estimate_minutes: number } | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState('')
  const [retryTick, setRetryTick] = useState(0)

  // 查询后台运行中的扩展版本，用于确认是否重载了新代码
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'zreadPing' }, (res) => {
      if (res?.version) setVersion(res.version)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setCfChallenge(false)
    setEta(null)
    const fetchOutline = async () => {
      try {
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'zreadReadOutline', repo },
            (res) => resolve(res)
          )
        })
        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message)
        if (response?.error === 'CF_CHALLENGE') throw new Error('CF_CHALLENGE')
        if (response?.error) throw new Error(response.error)

        // 真正未收录：显示"正在收录"并自动提交收录
        if (response?.notIndexed) {
          setIndexing(true)
          if (response?.eta) setEta(response.eta)
          chrome.runtime.sendMessage({ type: 'zreadSubmit', repo, mode: 'index' }, () => {})
          setOutline([])
          return
        }

        // 已收录但正在索引/刷新中：显示"索引中"，不重复提交
        if (response?.inProgress) {
          setIndexing(true)
          if (response?.eta) setEta(response.eta)
          setOutline(response?.outline || [])
          return
        }

        // 收录超过 7 天：静默提交刷新
        if (response?.stale) {
          chrome.runtime.sendMessage({ type: 'zreadSubmit', repo, mode: 'refresh' }, () => {})
        }

        if (response?.outline) {
          setOutline(response.outline)
          // 目录就绪后，通知后台按顺序预取并缓存各文档
          const slugs = [...response.outline]
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((p: any) => p.slug)
          if (slugs.length) chrome.runtime.sendMessage({ type: 'zreadPrefetch', repo, slugs }, () => {})
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CF_CHALLENGE') {
          setCfChallenge(true)
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load docs')
        }
      } finally {
        setLoading(false)
      }
    }
    fetchOutline()
  }, [repo, retryTick])

  const tree = useMemo(() => buildTree(outline), [outline])

  // 搜索框已移除：始终视为无搜索词（全部展开/折叠由用户控制）
  const hasSearch = false
  const query = ''

  const handleLinkClick = (e: React.MouseEvent, slug: string) => {
    e.preventDefault()
    e.stopPropagation()
    onDocClick?.(slug)
  }

  const toggleSection = (title: string) => {
    if (hasSearch) return // 搜索时不允许折叠
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const toggleGroup = (key: string) => {
    if (hasSearch) return
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 统一的头部（始终显示「在 zread.ai 打开 ↗」链接）
  const header = (
    <div className="zread-sidebar-header">
      <span className="zread-sidebar-title">
        {ICON_BOOK} {t('title')}
        {version ? <span className="zread-sidebar-ver"> v{version}</span> : null}
      </span>
      <a
        className="zread-sidebar-link"
        href={`https://zread.ai/${repo}`}
        target="_blank"
        rel="noopener noreferrer"
        title={t('openTitle')}
      >
        zread.ai ↗
      </a>
    </div>
  )

  if (loading) {
    return (
      <div className="zread-sidebar">
        {header}
        <div className="zread-sidebar-loading">{t('loadingOutline')}</div>
      </div>
    )
  }

  if (cfChallenge) {
    return (
      <div className="zread-sidebar">
        {header}
        <div className="zread-sidebar-cf">
          <p>{t('cfLine1')}</p>
          <p>{t('cfLine2')}</p>
          <button
            className="zread-cf-open-btn"
            onClick={() => chrome.runtime.sendMessage({ type: 'zreadOpenSite' }, () => {})}
          >
            {t('cfBtn')}
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="zread-sidebar">
        {header}
        <div className="zread-sidebar-error">
          {error}
          <br />
          <button className="zread-cf-open-btn" onClick={() => setRetryTick((v) => v + 1)}>
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="zread-sidebar">
      {header}
      {indexing && (
        <div className="zread-sidebar-indexing">
          {t('indexing')}
          {eta && (
            <>
              <br />
              {tEta(eta.backlog, eta.estimate_minutes)}
            </>
          )}
        </div>
      )}
      <div className="zread-tree">
        {outline.length > 0 ? (
          <>
            {/* Root level items */}
            {tree.rootItems.map((item) => {
              const match = !query || item.title.toLowerCase().includes(query)
              if (!match) return null
              return (
                <a
                  key={item.slug}
                  href={`https://zread.ai/${repo}/${item.slug}`}
                  onClick={(e) => handleLinkClick(e, item.slug)}
                  className="zread-leaf"
                  style={{ '--depth': 0 } as React.CSSProperties}
                  data-slug={item.slug}
                >
                  {ICON_DOC} {item.title}
                </a>
              )
            })}
            {/* Section grouped items */}
            {tree.sections.map((section) => {
              const isCollapsed = !hasSearch && collapsedSections.has(section.title)
              return (
                <div key={section.title} className={`zread-section${isCollapsed ? ' collapsed' : ''}`}>
                  <div className="zread-section-title" onClick={() => toggleSection(section.title)}>
                    <span className="zread-arrow">▾</span>
                    {section.title}
                  </div>
                  {section.children.map((child) => {
                    if (child.level === 1 && child.children.length === 0) {
                      // Direct item under section (depth 0)
                      const match = !query || child.title.toLowerCase().includes(query)
                      if (!match) return null
                      return (
                        <a
                          key={child.slug}
                          href={`https://zread.ai/${repo}/${child.slug}`}
                          onClick={(e) => handleLinkClick(e, child.slug)}
                          className="zread-leaf"
                          style={{ '--depth': 0 } as React.CSSProperties}
                          data-slug={child.slug}
                        >
                          {ICON_DOC} {child.title}
                        </a>
                      )
                    }
                    // Group with nested items
                    const groupKey = section.title + '/' + child.title
                    const groupCollapsed = !hasSearch && collapsedGroups.has(groupKey)
                    // Check if any child matches
                    const hasMatch = !query || child.children.some((c) =>
                      c.title.toLowerCase().includes(query)
                    )
                    if (!hasMatch) return null
                    return (
                      <div key={groupKey} className={`zread-group${groupCollapsed ? ' collapsed' : ''}`}>
                        <div className="zread-group-title" onClick={() => toggleGroup(groupKey)}>
                          <span className="zread-arrow">▾</span>
                          {child.title}
                        </div>
                        {child.children.map((item) => {
                          const match = !query || item.title.toLowerCase().includes(query)
                          if (!match) return null
                          return (
                            <a
                              key={item.slug}
                              href={`https://zread.ai/${repo}/${item.slug}`}
                              onClick={(e) => handleLinkClick(e, item.slug)}
                              className="zread-leaf"
                              style={{ '--depth': 1 } as React.CSSProperties}
                              data-slug={item.slug}
                            >
                              {item.title}
                            </a>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        ) : (
          <div className="zread-sidebar-empty">
            {indexing ? t('indexingWait') : t('noDocs')}
          </div>
        )}
      </div>
    </div>
  )
}
