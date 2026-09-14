# 发版流程 / Release Process

打 tag 即自动发版：GitHub Actions（`.github/workflows/release.yml`）会校验 tag 与仓库
版本一致、构建扩展、打包 store zip 与 CRX，并创建带产物的 GitHub Release。

## 步骤

1. 完成改动并确认 `CHROMEWEBSTORE.md` 版本历史已加新行。
2. 同步版本号到三处（`package.json`、`src/manifest.json`、`src/background.ts` 的
   `EXT_VERSION`）：

   ```bash
   bun run version:sync 0.1.5     # 接受 0.1.5 或 v0.1.5
   ```

3. 提交并推送：`git commit -am "release: 0.1.5" && git push`
4. 打 tag 并推送（tag 必须与版本号一致，`v` 前缀可选）：

   ```bash
   git tag v0.1.5 && git push origin v0.1.5
   ```

5. 在 GitHub 的 Actions 页观察 release workflow；完成后 Release 页有：
   - `zread-github-ext-<ver>.zip` — Chrome Web Store 上传包（manifest 在根、无 `_metadata/`）
   - `zread-github-ext-<ver>.crx` — 自托管安装包（仅当配置了 `CRX_PRIVATE_KEY`）
   - `SHA256SUMS.txt`

tag 版本与 `package.json` 不一致时 workflow 会直接失败并提示正确的同步命令——
扩展内版本号永远等于 tag 号。

## CRX 签名密钥（一次性配置）

CRX 用固定私钥签名，保证每次发版的扩展 ID 与升级链一致：

```bash
openssl genrsa -out crx-key.pem 2048
```

把 `crx-key.pem` 的**全部内容**存到仓库 Settings → Secrets and variables → Actions
→ New repository secret，名字 `CRX_PRIVATE_KEY`。私钥不要进仓库、不要外发；
丢失后无法续签同一 ID，需重新生成并视为新扩展。

未配置该 secret 时 workflow 仍会发 zip 与 Release，仅跳过 CRX 并给出 warning。

## 商店上架注意

CWS 提交用的是 zip（不是 crx）。若日后启用商店的"经过验证的 CRX 上传公钥"，
公钥可由私钥导出：`openssl rsa -in crx-key.pem -pubout -outform DER | base64`。
