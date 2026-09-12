// background.ts — zread.ai 数据获取服务（Service Worker）
// 请求策略：后台直连优先 → 遇 Cloudflare/网关类异常降级到页面代理 → 仍被拦则提示人机验证。
// 分区 cookie（cf_clearance）chrome.cookies 读不到，只有页面同站请求会自动携带。

import { detectLocale } from './github/i18n';

// 版本标记：每次发布改这里，控制台可确认扩展是否真的重载了新代码
const EXT_VERSION = '0.1.5';
console.log('[zread-ext] background service worker started, version', EXT_VERSION);

// 缓存键带语言前缀，避免中英文缓存互串
// 语言判定：页面上下文（content script）的 navigator.language 能读到用户的"首选网页语言"，
// 而 service worker 里它只是浏览器界面语言，切换网页语言时不会变。因此 locale 由 content
// script 随每条消息上报（message.locale），后台据此分区缓存与设置 X-Locale；无消息上下文
// （revalidate / prefetch 恢复）时沿用最近一次上报值。切换语言后缓存键随之改变，不会命中旧语言缓存。
function detectContentLocale(): string {
  return detectLocale() === 'zh' ? 'zh' : 'en';
}
let sessionLocale = detectContentLocale();
function contentLocale(): string {
  return sessionLocale;
}
// 缓存键版本：解析逻辑变更时升级，强制旧/脏缓存失效
const CACHE_KEY_V = 'v2';
// 独立 mermaid 渲染器文件（按需注入，不进主 content script）
const MERMAID_RENDERER_FILE = 'mermaid_renderer.js';
function outlineKey(repo: string): string {
  return `oc:${CACHE_KEY_V}:${contentLocale()}:${repo}`;
}
function pageKey(repo: string, slug: string): string {
  return `pc:${CACHE_KEY_V}:${contentLocale()}:${repo}::${slug}`;
}

// ==========================================
// chrome.storage.session：SW 被 Chrome 回收重启后仍在（浏览器关闭才清），
// 用于存放"丢了会出错"的瞬态状态（隐藏标签 id、提交冷却、预取进度）。
// 纯内存缓存在下面另行标注（statusMemo/inFlight 丢了只是多发请求，可接受）。
// ==========================================
async function sessionGet<T>(key: string): Promise<T | undefined> {
  try {
    const r = await chrome.storage.session.get(key);
    return r?.[key] as T | undefined;
  } catch {
    return undefined;
  }
}
async function sessionSet(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch (e) {
    console.log('[zread-ext] session set failed:', key, String(e));
  }
}
async function sessionRemove(key: string): Promise<void> {
  try {
    await chrome.storage.session.remove(key);
  } catch {
    /* ignore */
  }
}

// ==========================================
// 认证：读取应用层 cookie（token）并拼普通 Cookie 头；
// locale 由浏览器语言决定：仅中文浏览器用 zh，其余 en（含界面文案与 zread 内容）。
// cf_clearance 是分区 cookie（Partitioned，top-level=zread.ai），普通 getAll 读不到，
// 需带 partitionKey 查询；拼进 Cookie 头后后台直连即可通过 Cloudflare，
// 绝大多数情况下不再需要任何代理载体（屏幕外窗口仅作兜底）。
// ==========================================
async function getZreadAuth(): Promise<{ token: string | null; locale: string; cookieHeader: string }> {
  let cookies: chrome.cookies.Cookie[] = [];
  try {
    cookies = await chrome.cookies.getAll({ url: 'https://zread.ai' });
  } catch {
    cookies = [];
  }
  let partitioned: chrome.cookies.Cookie[] = [];
  try {
    partitioned = await chrome.cookies.getAll({ partitionKey: { topLevelSite: 'https://zread.ai' } });
  } catch {
    partitioned = []; // 旧版 Chrome 不支持 partitionKey：仅丢 cf_clearance，仍有降级链
  }
  let token: string | null = null;
  let cookieHeader = '';
  const seen = new Set<string>();
  for (const c of [...cookies, ...partitioned]) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    if (cookieHeader) cookieHeader += '; ';
    cookieHeader += `${c.name}=${c.value}`;
    if (c.name === 'CGX_AUTH_TOKEN') token = c.value;
  }
  // 仅识别到中文才用 zh，否则 en
  const locale = contentLocale();
  return { token, locale, cookieHeader };
}

// ==========================================
// Cloudflare 拦截检测
// ==========================================
class CfChallengeError extends Error {
  constructor() {
    super('CF_CHALLENGE');
    this.name = 'CfChallengeError';
  }
}

// Cloudflare / 网关类异常状态码（这些情况后台直连不可靠，需降级到页面代理）
function isCfStatus(s: number): boolean {
  return (
    s === 403 || // Forbidden（CF 拦截）
    s === 429 || // Too Many Requests（CF 限流）
    s === 500 || // Internal Server Error
    s === 502 || // Bad Gateway
    s === 503 || // Service Unavailable（CF 挑战）
    s === 504 || // Gateway Timeout
    (s >= 520 && s <= 529) // CF 自定义错误段
  );
}

// Cloudflare 人机验证 / 挑战页的内容特征
// 注意：zread 正常页面（含"正在收录"页）也可能被 Cloudflare 注入 challenge-platform 脚本，
// 但它们都是完整的 Next.js 应用页（带 __next_f）。真正的 CF 拦截页没有 __next_f。
function isCfChallengeText(text: string): boolean {
  if (!text) return false;
  if (text.includes('__next_f')) return false; // 完整应用页 => 不是拦截页
  const markers = [
    'Just a moment',
    'Checking your browser',
    'challenge-platform',
    '/cdn-cgi/challenge-platform',
    'cf-challenge-running',
    'Attention Required',
    'Performing security verification',
  ];
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

// 标签页标题是否表明停在人机验证页
function isChallengeTitle(title: string): boolean {
  const t = (title || '').toLowerCase();
  return t.includes('just a moment') || t.includes('checking your browser') || t.includes('attention required');
}

// 状态码是否属于"真人机挑战"（403/429/503 常伴随挑战页；502/504 是网关错误，不算）
function isChallengeStatus(s: number): boolean {
  return s === 403 || s === 429 || s === 503;
}

// ==========================================
// 同站代理：绝不创建用户可见的标签页
// 后台直连被 Cloudflare 拦截时，把请求交给一个"屏幕外窗口"里的 zread.ai 页面：
// 该窗口 left/top 设为 -32000（完全在可见屏幕之外）、不抢焦点，对用户不可见，
// 但它是 zread.ai 的顶层浏览上下文，其中的同源 fetch 自动携带全部 cookie
// （含 SW 读不到的分区 cf_clearance）——这是不产生可见标签页的唯一可行载体
// （cookie 只在 zread.ai 为顶层站点时发送，iframe/扩展页/GitHub 页注入均不可行，已实测）。
// 窗口 id 存 session storage，SW 重启后复用；全部被真人机挑战拦截 => CfChallengeError。
// ==========================================
interface ZreadResponse {
  status: number;
  ok: boolean;
  text: string;
  b64?: string;
  error?: string;
  pageUrl?: string;
  pageTitle?: string;
}

// 在后台把 base64 还原为字节（RSC 流处理用）
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const PROXY_FETCH_FILE = 'github/proxy-fetch.js';
const proxyInjected = new Set<number>();

// 向代理页注入主世界 fetch 助手（幂等：__zreadProxyFetch 已存在则跳过）
async function injectProxyFetcher(tabId: number): Promise<boolean> {
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: () => typeof (globalThis as any).__zreadProxyFetch === 'function',
    });
    if (probe?.[0]?.result) {
      proxyInjected.add(tabId);
      return true;
    }
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      files: [PROXY_FETCH_FILE],
    });
    proxyInjected.add(tabId);
    return true;
  } catch (e) {
    console.log('[zread-ext] inject proxy fetcher failed for tab', tabId, String(e));
    return false;
  }
}

// 屏幕外代理窗口单例：id 存 session storage，SW 重启后复用同一个窗口
const PROXY_WINDOW_KEY = 'proxyWindowId';
let proxyWindowCreating: Promise<chrome.windows.Window | null> | null = null;

async function ensureProxyWindow(): Promise<number | null> {
  const saved = await sessionGet<number>(PROXY_WINDOW_KEY);
  if (saved != null) {
    try {
      const win = await chrome.windows.get(saved, { windowTypes: ['normal'] });
      const [tab] = win.tabs || [];
      if (tab?.id != null) return tab.id;
    } catch {
      await sessionRemove(PROXY_WINDOW_KEY);
    }
  }
  let creating = proxyWindowCreating;
  if (!creating) {
    creating = (async (): Promise<chrome.windows.Window | null> => {
      const win =
        (await chrome.windows.create({
          url: 'https://zread.ai/',
          focused: false,
          // 屏幕外：用户看不见；不能用 minimized（部分平台会延迟加载/冻结页面）
          left: -32000,
          top: -32000,
          width: 800,
          height: 600,
        })) ?? null;
      if (win && win.id != null) await sessionSet(PROXY_WINDOW_KEY, win.id);
      return win;
    })();
    proxyWindowCreating = creating;
    void creating
      .catch(() => {})
      .finally(() => {
        proxyWindowCreating = null;
      });
  }
  const win = await creating;
  if (win?.id == null) return null;
  // 等页面加载稳定（Cloudflare 放行）
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const w = await chrome.windows.get(win.id, { windowTypes: ['normal'] });
      const [tab] = w.tabs || [];
      const title = (tab?.title || '').toLowerCase();
      if (title && !/just a moment|checking|attention required/.test(title)) return tab?.id ?? null;
    } catch {
      return null;
    }
  }
  const w = await chrome.windows.get(win.id, { windowTypes: ['normal'] }).catch(() => null);
  return w?.tabs?.[0]?.id ?? null;
}

// 代理窗口被关闭时清掉引用，下次需要时重建
chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    if (windowId === (await sessionGet<number>(PROXY_WINDOW_KEY))) await sessionRemove(PROXY_WINDOW_KEY);
  })();
});

// 在代理页主世界里发同源 fetch（浏览器自动带全部 cookie）
async function zreadFetchInProxyPage(
  tabId: number,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; asBytes?: boolean } = {}
): Promise<ZreadResponse> {
  if (!proxyInjected.has(tabId)) {
    const ok = await injectProxyFetcher(tabId);
    if (!ok) throw new Error('proxy fetcher not available');
  }
  const method = init.method || 'GET';
  const headers = init.headers || {};
  const body = init.body ?? null;
  const asBytes = init.asBytes === true;
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    world: 'MAIN',
    func: (u: string, m: string, h: Record<string, string>, b: string | null, wantBytes: boolean) =>
      (globalThis as any).__zreadProxyFetch(u, m, h, b, wantBytes),
    args: [url, method, headers, body, asBytes],
  });
  const r = results?.[0]?.result as ZreadResponse | undefined;
  console.log('[zread-ext] proxy fetch in offscreen page, tab', tabId, ': status', r?.status, '->', url);
  if (!r) {
    proxyInjected.delete(tabId); // 页面可能导航过，下次重新注入
    throw new Error('proxy page returned no result');
  }
  if (r.status === 0) proxyInjected.delete(tabId);
  return r;
}

// 代理响应是否"可用"：2xx 且正文不是挑战页、来源页不是错误页
function pageResultUsable(r: ZreadResponse): boolean {
  if (r.status < 200 || r.status >= 300) return false;
  if (isCfChallengeText(r.text)) return false;
  if (isChallengeTitle(r.pageTitle || '')) return false;
  const title = (r.pageTitle || '').toLowerCase();
  if (/504|503|502|gateway/.test(title)) return false;
  return true;
}

// 代理响应是否为"真人机挑战"（用于决定是否提示用户过验证）
function pageResultIsChallenge(r: ZreadResponse): boolean {
  if (isCfChallengeText(r.text)) return true;
  if (isChallengeTitle(r.pageTitle || '')) return true;
  return isChallengeStatus(r.status) && isCfChallengeText(r.text);
}

// ==========================================
// 后台直连请求（service worker 内 fetch，带普通 cookie）
// ==========================================
async function directFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; asBytes?: boolean } = {}
): Promise<ZreadResponse> {
  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body ?? undefined,
      redirect: 'follow',
    });
    if (init.asBytes) {
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const c = 0x8000;
      for (let i = 0; i < bytes.length; i += c) {
        bin += String.fromCharCode(...bytes.subarray(i, i + c));
      }
      return { status: res.status, ok: res.ok, text: '', b64: btoa(bin) };
    }
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (e) {
    return { status: 0, ok: false, text: '', error: String(e) };
  }
}

// 直连响应是否"真正可用"：2xx、非挑战页；
// HTML 整页必须带 Next flight 数据（否则视为空/拦截页）；API/JSON 与 RSC 只要求 2xx。
// 注意：写操作（如 refresh）成功时可能返回 204 等无body状态，不能只认 200。
function directUsable(r: ZreadResponse, url: string, isRsc = false): boolean {
  if (r.status < 200 || r.status >= 300) return false;
  if (isCfChallengeText(r.text)) return false;
  const isHtmlPage = !/\/api\//.test(url);
  if (isHtmlPage && !isRsc && !r.text.includes('__next_f')) return false;
  return true;
}

// ==========================================
// 智能请求：优先后台直连，遇到网络异常 / Cloudflare 拦截时
// 降级到 zread.ai 页面代理（页面同站请求会自动带分区 cf_clearance）。
// 若页面代理仍被挑战页拦截 => 抛出 CfChallengeError（提示用户去过人机验证）。
// ==========================================
async function zreadFetchSmart(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; asBytes?: boolean } = {}
): Promise<ZreadResponse> {
  const { token, locale, cookieHeader } = await getZreadAuth();

  // —— 1) 后台直连 ——
  const directHeaders = buildHeaders(token, locale, init.headers);
  if (cookieHeader) directHeaders['Cookie'] = cookieHeader;
  const isRsc = !!(init.headers && (init.headers['RSC'] || init.headers['rsc']));
  const direct = await directFetch(url, { ...init, headers: directHeaders });

  if (directUsable(direct, url, isRsc)) {
    console.log('[zread-ext] direct OK', direct.status, url);
    return direct;
  }
  console.log(
    `[zread-ext] direct blocked/failed (status=${direct.status}, challengeText=${isCfChallengeText(direct.text)}), falling back to page proxy:`,
    url
  );

  // —— 2) 同站代理：屏幕外窗口里的 zread.ai 页面（对用户不可见） ——
  const pageHeaders = buildHeaders(token, locale, init.headers);

  const attemptProxy = async (): Promise<{ ok: ZreadResponse | null; last: ZreadResponse | null; sawChallenge: boolean }> => {
    let last: ZreadResponse | null = null;
    let sawChallenge = false;
    const note = (r: ZreadResponse | null): ZreadResponse | null => {
      if (r) {
        last = r;
        if (pageResultIsChallenge(r)) sawChallenge = true;
      }
      return r && pageResultUsable(r) ? r : null;
    };

    const tabId = await ensureProxyWindow();
    if (tabId == null) return { ok: null, last, sawChallenge };

    const run = async (): Promise<ZreadResponse | null> => {
      try {
        return await zreadFetchInProxyPage(tabId, url, { ...init, headers: pageHeaders });
      } catch (e) {
        console.log('[zread-ext] proxy fetch in offscreen page threw:', String(e));
        return null;
      }
    };

    const ok = note(await run());
    if (ok) {
      console.log('[zread-ext] proxy OK via offscreen page', url);
      return { ok, last, sawChallenge };
    }
    // 瞬时 504/502（非真人机挑战）延迟重试一次
    const lastOnce = last as ZreadResponse | null;
    if (lastOnce && lastOnce.status !== 0 && !sawChallenge) {
      await new Promise((r) => setTimeout(r, 1200));
      const retry = note(await run());
      if (retry) {
        console.log('[zread-ext] proxy OK via delayed retry (offscreen page)', url);
        return { ok: retry, last, sawChallenge };
      }
    }
    return { ok: null, last, sawChallenge };
  };

  let result = await attemptProxy();

  // 网络层异常（status 0，如页面导航）时，整体重跑一次
  if (!result.ok && result.last?.status === 0 && !result.sawChallenge) {
    console.log('[zread-ext] network-level failure (status 0), re-running proxy once');
    await new Promise((r) => setTimeout(r, 800));
    result = await attemptProxy();
  }

  // —— 3) 都不行：真人机挑战才提示用户；否则报普通错误 ——
  if (result.ok) return result.ok;
  if (result.sawChallenge || (result.last && pageResultIsChallenge(result.last))) {
    console.log('[zread-ext] proxy hit a real Cloudflare challenge');
    throw new CfChallengeError();
  }
  throw new Error(`proxy failed (last status ${result.last?.status})`);
}

// 构造业务请求头（token + locale）；Cookie 由浏览器自动携带
function buildHeaders(token: string | null, locale: string, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'X-Locale': locale };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (extra) Object.assign(h, extra);
  return h;
}

// ==========================================
// Next.js flight data 解析
// ==========================================

// 从 HTML 中提取所有 self.__next_f.push payload 并拼接为完整 flight 流
function extractFlightPayloads(html: string): string {
  const pushRegex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let match: RegExpExecArray | null;
  let fullFlight = '';
  while ((match = pushRegex.exec(html)) !== null) {
    // 用 JSON.parse 正确解码 JS 字符串（替代脆弱的 replace 链）
    let js: string;
    try {
      js = JSON.parse('"' + match[1] + '"');
    } catch {
      // 回退：经典反转义链
      js = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\//g, '/')
        .replace(/\\\\/g, '\\');
    }
    fullFlight += js + '\n';
  }
  return fullFlight;
}

// 从 flight 流字节中提取文档 markdown：遍历所有 T chunk。
// 若提供 preferSlug，优先取 front-matter 中 slug 匹配的正文；否则取最大的正文 chunk。
// RSC 响应体本身就是 flight 流，HTML 内的 flight 解码后同样适用。
function extractMarkdownFromFlightBytes(flightBytes: Uint8Array, preferSlug?: string): string {
  const flightStr = new TextDecoder('utf-8').decode(flightBytes);
  const tChunkRegex = /([0-9a-f]+):T([0-9a-f]+),/g;
  let tm: RegExpExecArray | null;
  let best = '';
  let bestMatch = ''; // slug 命中的优先结果
  while ((tm = tChunkRegex.exec(flightStr)) !== null) {
    const byteLen = parseInt(tm[2], 16);
    if (byteLen < 200) continue; // 跳过小 chunk
    // T chunk 的 contentStart 是字符位置，转为字节位置截取
    const prefixStr = flightStr.slice(0, tm.index + tm[0].length);
    const prefixBytes = new TextEncoder().encode(prefixStr).length;
    const contentBytes = flightBytes.slice(prefixBytes, prefixBytes + byteLen);
    const content = new TextDecoder('utf-8').decode(contentBytes);
    const looksLikeDoc = content.startsWith('---\n') || content.includes('## ') || content.trim().startsWith('# ');
    if (!looksLikeDoc) continue;
    if (content.length > best.length) best = content;
    if (preferSlug && content.slice(0, 400).includes('slug:' + preferSlug) && content.length > bestMatch.length) {
      bestMatch = content;
    }
  }
  return bestMatch || best;
}

// front-matter 里的 slug 与请求 slug 不一致 => 说明 RSC 给的是别的页，拒绝使用
function rscSlugMismatch(markdown: string, slug: string): boolean {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false; // 无 front-matter，无法判断，放行
  const m = fm[1].match(/slug:\s*([^\n]+)/);
  if (!m) return false;
  return m[1].trim() !== slug;
}

// 递归查找 wiki 节点（包含 wiki + info 的对象）
function findWikiNode(node: any): any {
  if (!node) return null;
  if (typeof node === 'object' && !Array.isArray(node)) {
    if ('wiki' in node && node.wiki && typeof node.wiki === 'object' && 'info' in node.wiki) {
      return node.wiki;
    }
    for (const v of Object.values(node)) {
      const r = findWikiNode(v);
      if (r) return r;
    }
  } else if (Array.isArray(node)) {
    for (const item of node) {
      const r = findWikiNode(item);
      if (r) return r;
    }
  }
  return null;
}

// 从 flight 流中解析第一个平衡 JSON 对象（包含 wiki 数据）
function parseWikiFromFlight(flightStr: string): any | null {
  // 找包含 wiki_id 的位置，向前找最近的 { 开始平衡匹配
  const wikiIdx = flightStr.indexOf('wiki_id');
  if (wikiIdx === -1) return null;

  // 向前查找包含 "wiki":{"info" 的最外层 {
  // flight data 格式: 2d:["$","$L5f",null,{"wiki":{"info":{"wiki_id":"..."
  // 我们需要找到 {"wiki":{...}} 的起始 {
  const wikiMarker = '"wiki":{"info"';
  const markerIdx = flightStr.lastIndexOf(wikiMarker, wikiIdx);
  if (markerIdx === -1) return null;

  // 从 marker 向前找最近的 {（即 {"wiki":{ 的起始）
  let braceStart = flightStr.lastIndexOf('{', markerIdx);
  if (braceStart === -1) return null;

  // 平衡括号匹配，找到闭合的 }
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = braceStart; i < flightStr.length; i++) {
    const ch = flightStr[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;

  try {
    const data = JSON.parse(flightStr.slice(braceStart, end));
    return findWikiNode(data);
  } catch {
    return null;
  }
}

// ==========================================
// 通过 API 检查仓库索引状态（带 3s 短时去重，避免 prefetch/revalidate 重复请求）
// ==========================================
type RepoStatus = { status: string; wiki_id?: string; repo_id?: string; updated_at?: number } | null;
const statusMemo = new Map<string, { at: number; p: Promise<RepoStatus> }>();

async function checkRepoStatus(repo: string): Promise<RepoStatus> {
  const now = Date.now();
  const m = statusMemo.get(repo);
  if (m && now - m.at < 3000) return m.p;
  const p = checkRepoStatusLive(repo);
  statusMemo.set(repo, { at: now, p });
  p.catch(() => statusMemo.delete(repo));
  return p;
}

async function checkRepoStatusLive(repo: string): Promise<RepoStatus> {
  const [owner, repoName] = repo.split('/');
  try {
    const res = await zreadFetchSmart(`https://zread.ai/api/v1/repo/github/${owner}/${repoName}`);
    if (!res.ok) return null;
    const json = JSON.parse(res.text);
    const data = json?.data;
    if (!data) return null;
    return {
      status: data.status || 'unknown',
      wiki_id: data.wiki_id,
      repo_id: data.repo_id,
      updated_at: data.updated_at,
    };
  } catch (e) {
    if (e instanceof CfChallengeError) throw e; // 人机验证错误向上抛
    return null;
  }
}

// 判断是否正在索引/刷新中（已收录但尚未完成）
function isInProgress(info: { status: string } | null): boolean {
  return info?.status === 'progress' || info?.status === 'indexing' || info?.status === 'pending';
}

// 判断是否真正未收录（无 wiki_id 且不在索引中）
function isNotIndexed(info: { status: string; wiki_id?: string } | null): boolean {
  if (!info) return true;
  if (info.wiki_id) return false; // 有 wiki_id 说明已收录
  return !isInProgress(info); // 无 wiki_id 且不在索引中 => 未收录
}

// 判断收录是否超过 7 天
function isStale(info: { updated_at?: number } | null): boolean {
  if (!info || !info.updated_at) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const sevenDays = 7 * 24 * 60 * 60;
  return nowSec - info.updated_at > sevenDays;
}

// 获取收录排队 ETA：GET /api/v1/repo/eta => {code, data:{backlog, estimate_minutes}}
async function fetchRepoEta(): Promise<{ backlog: number; estimate_minutes: number } | null> {
  try {
    const res = await zreadFetchSmart('https://zread.ai/api/v1/repo/eta');
    if (!res.ok) return null;
    const json = JSON.parse(res.text);
    const d = json?.data;
    if (!d) return null;
    return { backlog: d.backlog ?? 0, estimate_minutes: d.estimate_minutes ?? 0 };
  } catch {
    return null;
  }
}

// ==========================================
// 提交收录 / 刷新（对接 zread.ai 真实 API，参考 ejfkdev/zread）
//   收录: POST /api/v1/public/repo/submit  body: {name_or_path, notification_email}
//   刷新: POST /api/v1/repo/{repo_id}/refresh  body: ""
// 冷却去重：同一仓库同模式在冷却期内只真正提交一次，避免 UI 重复触发/重复刷新。
// ==========================================
const SUBMIT_COOLDOWN = 24 * 60 * 60 * 1000; // 1 天
const COOLDOWN_KEY = 'submitCooldownAt';

// 冷却时间戳存 session storage：SW 重启后冷却仍然有效，不会重复提交
async function submitOnCooldown(repo: string, mode: 'index' | 'refresh'): Promise<boolean> {
  const map = (await sessionGet<Record<string, number>>(COOLDOWN_KEY)) || {};
  const last = map[`${mode}:${repo}`];
  return !!(last && Date.now() - last < SUBMIT_COOLDOWN); // 冷却中 => 视为已提交，跳过
}

async function markSubmitted(repo: string, mode: 'index' | 'refresh'): Promise<void> {
  const map = (await sessionGet<Record<string, number>>(COOLDOWN_KEY)) || {};
  map[`${mode}:${repo}`] = Date.now();
  await sessionSet(COOLDOWN_KEY, map);
}

async function submitIndexOrRefresh(repo: string, mode: 'index' | 'refresh'): Promise<boolean> {
  if (await submitOnCooldown(repo, mode)) {
    console.log('[zread-ext] submit', mode, 'skipped (cooldown):', repo);
    return true;
  }
  try {
    if (mode === 'index') {
      const res = await zreadFetchSmart('https://zread.ai/api/v1/public/repo/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_or_path: repo, notification_email: 'example@zread.ai' }),
      });
      if (!res.ok) return false;
      const json = JSON.parse(res.text);
      const ok = json?.code === 0;
      console.log('[zread-ext] submit index', repo, '->', ok);
      if (ok) await markSubmitted(repo, mode);
      return ok;
    } else {
      const info = await checkRepoStatus(repo);
      if (!info?.repo_id) return false;
      const res = await zreadFetchSmart(`https://zread.ai/api/v1/repo/${info.repo_id}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      const ok = res.status < 300;
      console.log('[zread-ext] submit refresh', repo, '->', ok);
      if (ok) await markSubmitted(repo, mode);
      return ok;
    }
  } catch (e) {
    if (e instanceof CfChallengeError) throw e;
    console.log('[zread-ext] submit', mode, 'failed for', repo, e);
    return false;
  }
}

// ==========================================
// 获取仓库文档目录（缓存优先）
// 有缓存 => 立即返回（不发任何阻塞请求），后台异步校验是否更新；
// 无缓存 => 走实时抓取。
// ==========================================
async function fetchOutline(repo: string) {
  console.log('[zread-ext] fetchOutline:', repo);
  const key = outlineKey(repo);
  const cached = await cacheGet(key);

  if (cached?.data?.outline?.length) {
    console.log('[zread-ext] outline cache HIT (no blocking request):', repo);
    cacheTouch(key, cached);
    void revalidateOutline(repo, key, cached); // 后台校验，不阻塞
    return {
      ...cached.data,
      notIndexed: false,
      inProgress: false,
      stale: isStale({ updated_at: cached.updatedAt }),
      fromCache: true,
    };
  }

  return fetchOutlineLive(repo);
}

// 后台校验目录缓存是否过期：过期则清缓存、重抓目录并重新预取
async function revalidateOutline(repo: string, key: string, cached: CacheEntry): Promise<void> {
  try {
    const st = await checkRepoStatus(repo);
    if (!st) return; // 状态接口失败 => 保留缓存
    if (isInProgress(st)) return; // 刷新/索引进行中 => 保留旧文档，不清缓存
    if (cacheFresh(cached, st.updated_at, st.wiki_id)) return; // 未更新 => 不动
    console.log('[zread-ext] background: repo updated, clearing + reloading:', repo);
    await clearRepoCache(repo);
    const data = await fetchOutlineLive(repo);
    if (data?.outline?.length) {
      const slugs = [...data.outline].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((p: any) => p.slug);
      if (slugs.length) void startPrefetch(repo, slugs);
    }
  } catch (e) {
    console.log('[zread-ext] background revalidate error:', String(e));
  }
}

// 实时抓取目录（无缓存或缓存失效时）
async function fetchOutlineLive(repo: string) {
  const statusInfo = await checkRepoStatus(repo);
  console.log('[zread-ext] repo status:', statusInfo?.status);

  const key = outlineKey(repo);

  if (isNotIndexed(statusInfo)) {
    const eta = await fetchRepoEta();
    return { outline: [], wiki_id: statusInfo?.wiki_id, repo_id: statusInfo?.repo_id, notIndexed: true, inProgress: false, stale: false, eta };
  }

  try {
    const res = await zreadFetchSmart(`https://zread.ai/${repo}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = res.text;

    const flightStr = extractFlightPayloads(html);
    const wiki = parseWikiFromFlight(flightStr);
    const pages = wiki?.pages || [];

    // 解析不到目录：
    //  - 若正在索引/刷新（progress）=> 显示"索引中"，不重复提交
    //  - 否则视为未收录 => 提交收录
    if (pages.length === 0) {
      const inProgress = isInProgress(statusInfo);
      // 刷新/索引中但本地有旧目录 => 展示旧文档（带 inProgress 标记），不显示"收录中"
      if (inProgress) {
        const cachedOld = await cacheGet(key);
        if (cachedOld?.data?.outline?.length) {
          console.log('[zread-ext] in progress but show cached old outline:', repo);
          return { ...cachedOld.data, notIndexed: false, inProgress: true, stale: false };
        }
      }
      const eta = await fetchRepoEta();
      return {
        outline: [],
        wiki_id: statusInfo?.wiki_id,
        repo_id: statusInfo?.repo_id,
        notIndexed: !inProgress,
        inProgress,
        stale: false,
        eta,
      };
    }

    const outline = pages.map((p: any) => ({
      page_id: p.page_id,
      slug: p.slug,
      title: [p.section, p.group, p.topic].filter(Boolean).join('/') || p.slug,
      topic: p.topic || '',
      group: p.group || '',
      section: p.section || '',
      order: p.order ?? 0,
    }));

    const data = {
      outline,
      wiki_id: wiki.info?.wiki_id,
      repo_id: wiki.info?.repo_id,
      notIndexed: false,
      inProgress: false,
    };
    await cacheSet(key, data, statusInfo?.updated_at ?? 0, statusInfo?.wiki_id);

    console.log('[zread-ext] outline success (fetched), pages:', outline.length);
    return { ...data, stale: isStale(statusInfo) };
  } catch (e) {
    // 抓取失败但有缓存 => 兜底返回缓存
    const fallback = await cacheGet(key);
    if (fallback?.data?.outline?.length) {
      console.log('[zread-ext] outline fetch failed, falling back to stale cache');
      return { ...fallback.data, stale: isStale(statusInfo), fromCache: true };
    }
    throw e;
  }
}

// ==========================================
// 获取单页 Markdown 内容（带缓存 + 在途去重）
// 缓存命中且 repo 未更新 => 直接返回；否则实时抓取并覆盖缓存；
// 抓取失败但有过期缓存 => 兜底返回缓存。
// statusInfo 可由调用方预取传入（预取时复用，避免重复请求状态接口）。
// ==========================================
async function fetchPage(repo: string, slug: string, statusInfo?: any, isUser = true) {
  console.log('[zread-ext] fetchPage:', repo, slug, isUser ? '(user)' : '(prefetch)');
  if (isUser) markUserLoad(repo, slug);

  const fk = `${repo}::${slug}`;
  const pkey = pageKey(repo, slug);
  // 已在途（用户或预取正在抓同一篇）=> 等待其完成并返回缓存/结果，避免重复请求
  if (inFlight.has(fk)) {
    console.log('[zread-ext] fetchPage: already in flight, waiting:', fk);
    await waitForInFlight(fk);
    const c = await cacheGet(pkey);
    if (c?.data?.markdown) return { ...c.data, fromCache: true };
  }

  // 用户点击且无预取传入状态 => 先乐观读缓存，命中秒返回（不发阻塞请求），后台校验
  if (isUser && statusInfo === undefined) {
    const c0 = await cacheGet(pkey);
    if (c0?.data?.markdown) {
      console.log('[zread-ext] page cache HIT (no blocking request):', repo, slug);
      cacheTouch(pkey, c0);
      void revalidatePage(repo, slug, c0);
      return { ...c0.data, fromCache: true };
    }
  }

  inFlight.add(fk);

  try {
    // 用 repo 状态（updated_at/wiki_id）作为失效依据
    const st = statusInfo !== undefined ? statusInfo : await checkRepoStatus(repo);
    const key = pkey;
    const cached = await cacheGet(key);
    if (cacheFresh(cached, st?.updated_at, st?.wiki_id) && cached?.data?.markdown) {
      console.log('[zread-ext] page cache HIT:', repo, slug);
      return { ...cached.data, fromCache: true };
    }

    try {
      const page = await fetchPageLive(repo, slug);
      if (page?.markdown) {
        await cacheSet(key, { markdown: page.markdown }, st?.updated_at ?? 0, st?.wiki_id);
      }
      return page;
    } catch (e) {
      if (cached?.data?.markdown) {
        console.log('[zread-ext] page fetch failed, falling back to stale cache:', repo, slug);
        return { ...cached.data, fromCache: true };
      }
      throw e;
    }
  } finally {
    inFlight.delete(fk);
    notifyInFlight(fk);
  }
}

// 后台校验单页缓存是否过期：过期则重抓覆盖（不阻塞当前展示）
async function revalidatePage(repo: string, slug: string, cached: CacheEntry): Promise<void> {
  try {
    const st = await checkRepoStatus(repo);
    if (!st) return;
    if (cacheFresh(cached, st.updated_at, st.wiki_id)) return; // 未更新
    console.log('[zread-ext] background: page updated, refetching:', slug);
    const page = await fetchPageLive(repo, slug);
    if (page?.markdown) {
      await cacheSet(pageKey(repo, slug), { markdown: page.markdown }, st.updated_at ?? 0, st.wiki_id);
    }
  } catch (e) {
    console.log('[zread-ext] background page revalidate error:', slug, String(e));
  }
}

// 实时抓取单页（原逻辑：HTML 提 T chunk，失败回退 RSC）
// 抓取单页：优先 RSC（rsc:1，响应只含 flight 流，小且快），无正文/失败再回退完整 HTML。
async function fetchPageLive(repo: string, slug: string) {
  try {
    const md = await fetchPageRSC(repo, slug);
    if (md?.markdown) {
      console.log('[zread-ext] page via RSC, markdown length:', md.markdown.length);
      return md;
    }
    console.log('[zread-ext] RSC returned no markdown, falling back to HTML');
  } catch (e) {
    console.log('[zread-ext] RSC failed, falling back to HTML:', String(e));
  }
  return fetchPageHTML(repo, slug);
}

// 回退：完整 HTML，提取内嵌 flight 后解析 T chunk
async function fetchPageHTML(repo: string, slug: string) {
  const res = await zreadFetchSmart(`https://zread.ai/${repo}/${slug}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fullFlight = extractFlightPayloads(res.text);
  const markdown = extractMarkdownFromFlightBytes(new TextEncoder().encode(fullFlight), slug);
  console.log('[zread-ext] page via HTML, markdown length:', markdown.length);
  return { markdown };
}

// RSC 方式：rsc:1 头，响应体即 flight 流。
// 解析采用官方 zread 的"倒找 ,---"法取最后一个正文 chunk；失败再退回全 T chunk 扫描。
// 若 RSC 给的是别的页（slug 不匹配）则返回空，交由 HTML 回退，保证内容正确。
async function fetchPageRSC(repo: string, slug: string) {
  const res = await zreadFetchSmart(`https://zread.ai/${repo}/${slug}`, {
    headers: { RSC: '1' },
    asBytes: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = res.b64 ? b64ToBytes(res.b64) : new TextEncoder().encode(res.text);
  let markdown = parseRscEndMarker(buffer);
  if (!markdown) markdown = extractMarkdownFromFlightBytes(buffer, slug);
  if (markdown && rscSlugMismatch(markdown, slug)) {
    console.log('[zread-ext] RSC returned wrong slug, rejecting:', slug);
    return { markdown: '' };
  }
  return { markdown };
}

// 官方解析：倒着找 ",---"，取其前行头部 id:T<len>, 再截取 len 字节正文
function parseRscEndMarker(buffer: Uint8Array): string {
  const marker = [44, 45, 45, 45]; // ",---"
  let endPos = -1;
  for (let i = buffer.length - marker.length; i >= 0; i--) {
    let found = true;
    for (let j = 0; j < marker.length; j++) {
      if (buffer[i + j] !== marker[j]) { found = false; break; }
    }
    if (found) { endPos = i; break; }
  }
  if (endPos === -1) return '';
  let lineStart = 0;
  for (let i = endPos - 1; i >= 0; i--) {
    if (buffer[i] === 10) { lineStart = i + 1; break; }
  }
  const headerLine = new TextDecoder('iso-8859-1').decode(buffer.slice(lineStart, endPos + 1));
  const m = /^([0-9a-f]+):T([0-9a-f]+),/.exec(headerLine);
  if (!m) return '';
  const byteLength = parseInt(m[2], 16);
  const headerEnd = lineStart + m[0].length;
  try {
    return new TextDecoder('utf-8').decode(buffer.slice(headerEnd, headerEnd + byteLength));
  } catch {
    return '';
  }
}

// ==========================================
// 缓存层：chrome.storage.local + LRU（50MB 软上限）
// 失效依据：repo 的 updated_at / wiki_id 变化 => 重新抓取覆盖
// ==========================================
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

interface CacheEntry {
  k: string;        // 缓存键
  lastAccess: number; // 最后访问时间 (ms)
  updatedAt: number;  // 抓取时 repo 的 updated_at (秒)
  wiki_id?: string;   // 抓取时的 wiki_id
  data: any;          // 业务数据
  size: number;       // 估算字节数
}

function estBytes(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const r = await chrome.storage.local.get(key);
    const e = r?.[key] as CacheEntry | undefined;
    if (!e) return null;
    return e;
  } catch {
    return null;
  }
}

// 命中后异步刷新 lastAccess（不阻塞、不影响本次读取）
function cacheTouch(key: string, e: CacheEntry): void {
  const updated = { ...e, lastAccess: Date.now() };
  chrome.storage.local.set({ [key]: updated });
}

async function cacheSet(key: string, data: any, updatedAt: number, wiki_id?: string): Promise<void> {
  const entry: CacheEntry = {
    k: key,
    lastAccess: Date.now(),
    updatedAt,
    wiki_id,
    data,
    size: estBytes(data) + 200,
  };
  try {
    await chrome.storage.local.set({ [key]: entry });
  } catch (e) {
    console.log('[zread-ext] cache set failed for', key, String(e));
  }
  evictIfNeeded();
}

// 超出 50MB 时按 lastAccess 从旧到新删除
async function evictIfNeeded(): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const entries: CacheEntry[] = [];
    let total = 0;
    for (const key of Object.keys(all)) {
      const e = all[key] as CacheEntry;
      if (e && typeof e === 'object' && e.k && typeof e.size === 'number') {
        entries.push(e);
        total += e.size;
      }
    }
    if (total <= CACHE_MAX_BYTES) return;
    entries.sort((a, b) => a.lastAccess - b.lastAccess);
    const toRemove: string[] = [];
    while (total > CACHE_MAX_BYTES && entries.length > 0) {
      const oldest = entries.shift()!;
      toRemove.push(oldest.k);
      total -= oldest.size;
    }
    if (toRemove.length) {
      console.log('[zread-ext] cache evict', toRemove.length, 'entries, new total', total);
      await chrome.storage.local.remove(toRemove);
    }
  } catch (e) {
    console.log('[zread-ext] cache evict error:', String(e));
  }
}

// 判断缓存是否与当前 repo 状态一致（未更新）
function cacheFresh(e: CacheEntry | null, updatedAt?: number, wiki_id?: string): boolean {
  if (!e) return false;
  if (wiki_id && e.wiki_id && e.wiki_id !== wiki_id) return false;
  if (updatedAt && e.updatedAt && e.updatedAt !== updatedAt) return false;
  return true;
}

// ==========================================
// 仓库级缓存清除：检测到文档更新（updated_at/wiki_id 变化）时
// 删除该仓库的目录缓存 + 全部单页缓存，随后由预取重新后台加载。
// ==========================================
async function clearRepoCache(repo: string): Promise<number> {
  try {
    const all = await chrome.storage.local.get(null);
    const toRemove: string[] = [];
    for (const key of Object.keys(all)) {
      const isOutline = key.startsWith('oc:') && key.endsWith(`:${repo}`);
      const isPage = key.startsWith('pc:') && key.includes(`:${repo}::`);
      if (isOutline || isPage) toRemove.push(key);
    }
    if (toRemove.length) {
      await chrome.storage.local.remove(toRemove);
      console.log('[zread-ext] cleared stale repo cache:', repo, 'entries:', toRemove.length);
    }
    return toRemove.length;
  } catch (e) {
    console.log('[zread-ext] clearRepoCache error:', String(e));
    return 0;
  }
}

// ==========================================
// 在途去重：同一 repo::slug 同时只有一个抓取任务
// ==========================================
const inFlight = new Set<string>();
const inFlightWaiters = new Map<string, Array<() => void>>();

function waitForInFlight(key: string): Promise<void> {
  return new Promise((resolve) => {
    const arr = inFlightWaiters.get(key) || [];
    arr.push(resolve);
    inFlightWaiters.set(key, arr);
    // 安全阀：最多等 60s，防止悬挂
    setTimeout(resolve, 60000);
  });
}

function notifyInFlight(key: string): void {
  const arr = inFlightWaiters.get(key);
  if (arr) {
    inFlightWaiters.delete(key);
    arr.forEach((fn) => fn());
  }
}

// ==========================================
// 预取调度器：目录就绪后按顺序串行预取并缓存文档
// SW 存活期间用 setTimeout 维持 5s 间隔；队列进度持久化在 session storage，
// 并用 1 分钟周期的看门狗 alarm 兜底：SW 被回收重启后（定时器丢失），
// alarm 或任意唤醒事件会把链条重新接上，预取不会静默死掉。
// 跳过已缓存/在途的；用户点击的优先（不与其冲突）；
// 遇到人机挑战或连续失败则停止，避免无效轰炸。
// ==========================================
const PREFETCH_INTERVAL = 5000;
const PREFETCH_QUEUE_KEY = 'prefetchQueue';
const PREFETCH_ALARM = 'zread-prefetch-watchdog';

interface PrefetchQueue {
  repo: string;
  slugs: string[];
  index: number;
  consecFail: number;
}
interface PrefetchState extends PrefetchQueue {
  timer: ReturnType<typeof setTimeout> | null;
  status: any;
  stopped: boolean;
}
let prefetchState: PrefetchState | null = null;

async function savePrefetchQueue(): Promise<void> {
  if (!prefetchState) return;
  const q: PrefetchQueue = {
    repo: prefetchState.repo,
    slugs: prefetchState.slugs,
    index: prefetchState.index,
    consecFail: prefetchState.consecFail,
  };
  await sessionSet(PREFETCH_QUEUE_KEY, q);
}

function stopPrefetch(): void {
  if (prefetchState) {
    prefetchState.stopped = true;
    if (prefetchState.timer) clearTimeout(prefetchState.timer);
  }
  prefetchState = null;
  void chrome.alarms.clear(PREFETCH_ALARM);
  void sessionRemove(PREFETCH_QUEUE_KEY);
}

async function startPrefetch(repo: string, slugs: string[]): Promise<void> {
  stopPrefetch();
  const state: PrefetchState = { repo, slugs, index: 0, consecFail: 0, timer: null, status: null, stopped: false };
  prefetchState = state;
  await savePrefetchQueue();
  // 看门狗：SW 重启后 1 分钟内必然唤醒一次，用来接回预取链条
  chrome.alarms.create(PREFETCH_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  console.log('[zread-ext] prefetch start:', repo, 'docs:', slugs.length);
  // 第一个立即开始（先拿一次状态供后续复用）
  void (async () => {
    state.status = await checkRepoStatus(repo);
    // 页面刷新/重开时跳过"已有缓存"的，从第一个没缓存的开始（不按 updated_at 判新鲜，保证续传）
    while (state.index < state.slugs.length) {
      const c = await cacheGet(pageKey(repo, state.slugs[state.index]));
      if (c?.data?.markdown) {
        state.index++;
      } else {
        break;
      }
    }
    await savePrefetchQueue();
    console.log('[zread-ext] prefetch resume at index', state.index, '/', slugs.length);
    prefetchTick(state, 0);
  })();
}

// SW 重启后由看门狗 alarm / 启动事件调用：内存链条已死但队列未完 => 重建链条
async function resumePrefetchIfNeeded(): Promise<void> {
  if (prefetchState) return; // 链条还活着
  const q = await sessionGet<PrefetchQueue>(PREFETCH_QUEUE_KEY);
  if (!q || !Array.isArray(q.slugs) || q.index >= q.slugs.length) return;
  const state: PrefetchState = { ...q, timer: null, status: null, stopped: false };
  prefetchState = state;
  chrome.alarms.create(PREFETCH_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  console.log('[zread-ext] prefetch resumed after SW restart at index', q.index, '/', q.slugs.length);
  void (async () => {
    state.status = await checkRepoStatus(q.repo);
    prefetchTick(state, 0);
  })();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== PREFETCH_ALARM) return;
  void resumePrefetchIfNeeded();
});
// SW 每次被唤醒都会执行顶层代码：有未完成的持久队列就接上
void resumePrefetchIfNeeded();

function prefetchTick(state: PrefetchState, delay: number): void {
  if (state.stopped || prefetchState !== state) return;
  state.timer = setTimeout(() => void prefetchStep(state), delay);
}

async function prefetchStep(state: PrefetchState): Promise<void> {
  if (state.stopped || prefetchState !== state) return;
  if (state.index >= state.slugs.length) {
    console.log('[zread-ext] prefetch done:', state.repo);
    stopPrefetch();
    return;
  }
  const slug = state.slugs[state.index++];
  const fk = `${state.repo}::${slug}`;

  // 已在途（用户正在看或已有任务）=> 跳过，尽快下一个
  if (inFlight.has(fk)) {
    prefetchTick(state, 300);
    return;
  }
  // 已有缓存 => 跳过（更新时会由 clearRepoCache 清掉，届时才会重抓）
  const cached = await cacheGet(pageKey(state.repo, slug));
  if (cached?.data?.markdown) {
    prefetchTick(state, 300);
    return;
  }

  try {
    await fetchPage(state.repo, slug, state.status, false);
    state.consecFail = 0;
    console.log('[zread-ext] prefetch cached:', slug);
    await savePrefetchQueue();
    prefetchTick(state, PREFETCH_INTERVAL);
  } catch (e) {
    if (e instanceof CfChallengeError) {
      console.log('[zread-ext] prefetch stopped by CF challenge');
      stopPrefetch();
      return;
    }
    state.consecFail++;
    console.log('[zread-ext] prefetch failed for', slug, '(' + state.consecFail + ')');
    if (state.consecFail >= 3) {
      console.log('[zread-ext] prefetch stopped after consecutive failures');
      stopPrefetch();
      return;
    }
    await savePrefetchQueue();
    prefetchTick(state, PREFETCH_INTERVAL);
  }
}

// 用户主动加载某篇时：若预取正停在它后面不影响；预取会因 inFlight 自动让路
function markUserLoad(repo: string, slug: string): void {
  // 将用户点击的 slug 提前没有副作用；这里仅记录日志
  if (prefetchState && prefetchState.repo === repo) {
    console.log('[zread-ext] user load while prefetching:', slug);
  }
}

// ==========================================
// 消息处理
// ==========================================

// 把错误统一转成响应体；Cloudflare 人机验证错误映射为 CF_CHALLENGE
function errPayload(err: unknown): { error: string } {
  if (err instanceof CfChallengeError) return { error: 'CF_CHALLENGE' };
  return { error: err instanceof Error ? err.message : String(err) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[zread-ext] background received message:', message?.type);
  if (!message || !message.type) return false;

  // content script 上报当前页面语言环境（见 contentLocale 注释），必须在任何缓存键计算之前采纳
  if (typeof message.locale === 'string') sessionLocale = message.locale === 'zh' ? 'zh' : 'en';

  if (message.type === 'zreadReadOutline') {
    (async () => {
      try {
        const data = await fetchOutline(message.repo);
        sendResponse({
          outline: data.outline,
          wiki_id: data.wiki_id,
          repo_id: data.repo_id,
          notIndexed: data.notIndexed,
          inProgress: data.inProgress,
          stale: data.stale,
          eta: data.eta,
        });
      } catch (err) {
        console.error('[zread-ext] outline error:', (err as Error)?.message || err);
        sendResponse(errPayload(err));
      }
    })();
    return true;
  }

  if (message.type === 'zreadSubmit') {
    // mode: 'index' | 'refresh'
    (async () => {
      try {
        const ok = await submitIndexOrRefresh(message.repo, message.mode || 'index');
        sendResponse({ ok });
      } catch (err) {
        if (err instanceof CfChallengeError) sendResponse({ ok: false, ...errPayload(err) });
        else sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (message.type === 'zreadReadPage') {
    (async () => {
      try {
        const page = await fetchPage(message.repo, message.slug);
        sendResponse({ page });
      } catch (err) {
        console.error('[zread-ext] page error:', (err as Error)?.message || err);
        sendResponse(errPayload(err));
      }
    })();
    return true;
  }

  if (message.type === 'zreadRenderMermaid') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return false;
    }
    (async () => {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: [MERMAID_RENDERER_FILE] });
        sendResponse({ ok: true });
      } catch (e) {
        console.log('[zread-ext] inject mermaid renderer failed:', e);
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (message.type === 'zreadPrefetch') {
    // 目录就绪后，按顺序串行预取并缓存文档
    if (Array.isArray(message.slugs) && message.slugs.length) {
      void startPrefetch(message.repo, message.slugs);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'zreadOpenSite') {
    // UI 请求打开 zread.ai 让用户过人机验证
    void chrome.tabs.create({ url: 'https://zread.ai/', active: true });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'zreadPing') {
    // 返回运行中的扩展版本，用于确认是否重载了新代码
    sendResponse({ version: EXT_VERSION });
    return false;
  }

  return false;
});
