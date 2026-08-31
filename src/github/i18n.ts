// i18n.ts — 轻量国际化：识别到中文（zh*）用中文，否则默认英文。

export type Locale = 'zh' | 'en'

export function detectLocale(): Locale {
  try {
    const lang = (navigator.language || '').toLowerCase()
    return lang.startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export const LOCALE: Locale = detectLocale()

const S = {
  title: { en: 'Zread Docs', zh: 'Zread 文档' },
  openTitle: { en: 'Open on zread.ai', zh: '在 zread.ai 打开' },
  loadingOutline: { en: 'Loading contents…', zh: '加载目录中…' },
  loadingDoc: { en: 'Loading document…', zh: '正在加载文档…' },
  loadFail: { en: 'Failed to load: ', zh: '加载失败：' },
  retry: { en: 'Retry', zh: '重试' },
  cfLine1: {
    en: 'zread.ai triggered a Cloudflare human check that the extension cannot pass.',
    zh: 'zread.ai 触发了 Cloudflare 人机验证，扩展无法自动通过。',
  },
  cfLine2: {
    en: 'Open zread.ai in your browser, complete the check, then refresh this page.',
    zh: '请先在浏览器打开 zread.ai 完成验证，然后回来刷新本页。',
  },
  cfBtn: { en: 'Open zread.ai to verify ↗', zh: '打开 zread.ai 完成验证 ↗' },
  cfShort: { en: 'zread.ai triggered a Cloudflare human check.', zh: 'zread.ai 触发了 Cloudflare 人机验证。' },
  indexing: {
    en: 'This repo is being indexed. Docs will be available on zread.ai once done.',
    zh: '该仓库正在收录/索引中，完成后即可在 zread.ai 查看文档。',
  },
  indexingWait: { en: 'Indexing in progress, please wait…', zh: '收录中，请稍候…' },
  noDocs: { en: 'No zread docs for this repo yet.', zh: '该仓库暂无 zread 文档' },
} as const

export type I18nKey = keyof typeof S

export function t(key: I18nKey): string {
  const entry = S[key]
  return (entry[LOCALE] ?? entry.en) as string
}

// 排队 ETA 文案（含数字占位）
export function tEta(backlog: number, minutes: number): string {
  return LOCALE === 'zh'
    ? `前面有 ${backlog} 个仓库在您之前，预计等待约 ${minutes} 分钟。`
    : `${backlog} repo(s) ahead of you, estimated wait ~${minutes} min.`
}
