# 发布流程

发布必须取得明确授权。T008 已合并；用户于 2026-10-20 授权 T009 发布 v0.5.3，包括必要发布修复、验证、整合、标签与正式 Release。后续其他版本仍需各自授权。

1. 同步 `package.json`、lock 根包、`src/shared/defaults.ts` 的版本，补充发行说明。核对最终差异、验收和 CI 后整合到 main。
2. Windows x64／Node 24 执行 `npm ci`、`npm run build`、`npm test`、`npm run test:smoke`，运行两个 helper 文件测试。更新器改动还需 `node tests/update-packaged.mjs` 的独立 ID 升级／失败恢复验证，不使用当前真实桌宠。
3. `npm run dist` 产生两个 EXE、latest.yml 和 NSIS blockmap。执行 `node scripts/verify-release.mjs` 核对文件名、版本、大小、SHA-512 并生成两个 EXE 的 SHA256SUMS.txt；执行 `node scripts/verify-update-runtime.mjs` 检查 asar 内运行依赖、助手和固定发布源。
4. 经明确授权后创建并推送与包版本一致的新标签，例如 v0.5.3。保留旧标签，不修改已公开版本。
5. Release workflow 先拒绝覆盖已发布的同标签 Release，再测试、打包、验证；创建／更新**草稿 Release** 并上传下面五项。全部上传后重新查询 API，逐个核对 uploaded、文件名、字节数及 GitHub SHA-256 digest，再把草稿设为正式／latest。任一不完整则保留草稿，客户端不能发现半成品。

草稿通过分页 releases 集合按 tag 精确查询；按标签接口只返回已发布版本，不能用于草稿门禁。若标签发布中断，修复工作流后可从 Actions 手动运行 Release，填写既有稳定 `release_tag`；工作流使用主线定义、checkout 该标签源码打包，保留原标签和发布内容，不能覆盖已公开版本。

已有唯一草稿时，使用 `gh release upload --clobber` 仅替换五附件，不重写 tag／target 等元信息；不存在时由 action 新建草稿。两条路径都必须经过同一文件摘要门禁后才转正。上传失败继续保留草稿，不增加工作流权限；T009 的 action 草稿元信息 403 与恢复结果见任务记录。

| 资源 | 用途 |
| --- | --- |
| `DesktopPet-<版本>-Setup-x64.exe` | NSIS 整包更新 |
| `DesktopPet-<版本>-Portable-x64.exe` | 免安装整包替换 |
| `SHA256SUMS.txt` | 免安装校验及人工核对 |
| `latest.yml` | NSIS 版本、文件名、大小和 SHA-512 |
| `DesktopPet-<版本>-Setup-x64.exe.blockmap` | 保留标准更新资源，首版关闭差分 |

普通分支和 PR 只运行 CI，不会发布 Release。工作流使用仅限 release job 的 contents: write 和临时 GITHUB_TOKEN；应用不使用 GitHub 凭据。只接收固定仓库的正式新版本，不降级、不安装预发布。

首次接入为 v0.5.3：v0.5.2 必须先手动覆盖升级一次，无需卸载或删除 `%APPDATA%\DesktopPlay`；此后可通过软件内更新。开发／演示禁用真实更新。官方参考：[electron-builder v26 更新文档](https://www.electron.build/v26/docs/features/auto-update/)。远端完成后另记 Release／latest、五项公开下载和摘要核对；本地打包不等于已发布。

官方 Actions 文档：[`actions/checkout`](https://github.com/actions/checkout)、[`actions/setup-node`](https://github.com/actions/setup-node) 和 [`softprops/action-gh-release`](https://github.com/softprops/action-gh-release)。当前工作流使用其官方主版本标签：checkout v7、setup-node v7、action-gh-release v3。
