// scripts/sync-version.mjs — 把版本号同步写入 package.json / src/manifest.json / src/background.ts
// 用法：node scripts/sync-version.mjs 1.2.3
// CI（打 tag 时）与本地发版前共用，保证三处版本与 tag 一致。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2] || '';
const version = raw.replace(/^v/, '').trim();
if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`[sync-version] invalid version: ${JSON.stringify(raw)} (expect semver like 0.1.5 or v0.1.5)`);
  process.exit(1);
}

// package.json + src/manifest.json：替换 "version": "…"
for (const rel of ['package.json', 'src/manifest.json']) {
  const p = join(root, rel);
  const s = readFileSync(p, 'utf8');
  let hit = false;
  const next = s.replace(/"version":\s*"[^"]*"/, () => {
    hit = true;
    return `"version": "${version}"`;
  });
  if (!hit) throw new Error(`[sync-version] no "version" field found in ${rel}`);
  writeFileSync(p, next);
  console.log(`[sync-version] ${rel} -> ${version}`);
}

// src/background.ts：EXT_VERSION 常量（侧栏徽章与诊断日志用它）
const bp = join(root, 'src/background.ts');
const bs = readFileSync(bp, 'utf8');
let bhit = false;
const bn = bs.replace(/const EXT_VERSION = '[^']*';/, () => {
  bhit = true;
  return `const EXT_VERSION = '${version}';`;
});
if (!bhit) throw new Error('[sync-version] EXT_VERSION const not found in src/background.ts');
writeFileSync(bp, bn);
console.log(`[sync-version] src/background.ts EXT_VERSION -> ${version}`);
