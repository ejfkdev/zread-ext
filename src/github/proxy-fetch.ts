// proxy-fetch.ts — 注入 github.com 页面主世界（MAIN world）的同站代理 fetch。
// 主世界里的 fetch 对 zread.ai 是"页面上下文请求"，浏览器自动携带全部 cookie
// （含 SW 读不到的分区 cf_clearance），效果等同旧的 zread.ai 标签页代理，
// 但不需要打开任何标签页。由后台通过 chrome.scripting.executeScript 按需注入。

;(globalThis as any).__zreadProxyFetch = async (
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | null,
  wantBytes: boolean
) => {
  const meta = { pageUrl: location.href, pageTitle: document.title };
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include',
      redirect: 'follow',
    });
    if (wantBytes) {
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const c = 0x8000;
      for (let i = 0; i < bytes.length; i += c) {
        bin += String.fromCharCode(...bytes.subarray(i, i + c));
      }
      return { status: res.status, ok: res.ok, text: '', b64: btoa(bin), ...meta };
    }
    const text = await res.text();
    return { status: res.status, ok: res.ok, text, ...meta };
  } catch (e) {
    return { status: 0, ok: false, text: '', error: String(e), ...meta };
  }
};
