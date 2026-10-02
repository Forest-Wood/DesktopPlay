# 发布流程

1. 更新 `package.json` 的版本号，并提交代码到 `main`。
2. 本地在 Windows x64 环境执行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build` 和 `npm run test:smoke`；按需用 `npm run dist` 检查安装包。
3. 创建与 package.json 版本一致的标签，例如 `v0.1.0`，并推送标签。
4. `.github/workflows/release.yml` 在 Windows runner 上验证标签版本，运行单元测试和打包，检查 `release/` 中恰有安装版与 portable 版两个 x64 exe，生成 SHA-256 校验文件并创建 GitHub Release。

发布产物名称为 `DesktopPlay-<版本>-Setup-x64.exe`、`DesktopPlay-<版本>-Portable-x64.exe` 和 `SHA256SUMS.txt`。普通分支提交和 PR 只运行 CI，不会创建 Release。发布使用工作流内置的 `GITHUB_TOKEN`，不需要设置额外的发布密钥；release job 只授予 `contents: write`。

官方 Actions 文档：[`actions/checkout`](https://github.com/actions/checkout)、[`actions/setup-node`](https://github.com/actions/setup-node) 和 [`softprops/action-gh-release`](https://github.com/softprops/action-gh-release)。当前工作流使用其官方主版本标签：checkout v7、setup-node v7、action-gh-release v3。
