// cf-notice.ts — 极小的通知总线：任何地方遇到 Cloudflare 人机验证（CF_CHALLENGE）时，
// 通知左侧文档面板显示"手动完成验证"提示（面板是既定的提示区域）。
// 单独成模块以避免 ui.tsx ↔ doc-panel.tsx 循环依赖。

let handler: (() => void) | null = null

/** 文档面板挂载时注册；返回取消注册函数 */
export function onCfChallenge(fn: () => void): () => void {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/** 任意位置遇到人机验证时调用 */
export function raiseCfChallenge(): void {
  handler?.()
}