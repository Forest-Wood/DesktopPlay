# 发布流程

发布必须取得本次明确授权。最新正式版 v1.0.0 由 [T014](tasks/T014-release-v100.md) 发布；历史 v0.5.4 由 T011 发布。T012 建立后续版本规则与公告流程。保留历史版本及附件，后续发布需各自授权。

## 版本与公告准备

从 v0.5.4 之后开始：已有功能修补／完善为 patch（0.5.4 → 0.5.5），部分桌宠新增为 minor（→ 0.6.0），全部桌宠新增为 major（→ 1.0.0）。以发布时支持的档案为范围，自定义 GPT 共用原版。修补即使影响全部桌宠仍是 patch；一次发布取最高档，只升一次并清零低位。纯文档／构建／内部整理不单独升软件版本，普通开发保留当前版本。

发布者在 PR 中说明分类与范围，核实最新正式版本，再填写一份简短中文公告（通常 3–6 条修改要点，必要时附升级注意）。例如将公告写到忽略的 `.tmp/update-notes.md`，准备包含完善和部分桌宠新增的发布：

```powershell
npm.cmd run release:prepare -- --base 0.5.4 --types patch,minor --notes .tmp/update-notes.md
npm.cmd run release:check
```

命令生成 `release-plan.json`（`baseVersion`、`changeTypes`）和 `docs/releases/v0.6.0.md`，同步 package、lock 根包与 APP_VERSION。重复同一计划仍为 0.6.0，可省略 `--notes` 复用已生成公告；不是再递增一次。已有标签拒绝准备，非法类型、空／缺公告或版本字段不一致在写入前拒绝。内部维护不声明虚假的功能类型；不需要发布时不创建计划。

CI 核对类型计算、字段一致性及公告；当前 0.5.4 无计划仍可正常开发。正式发布必须有计划，在打包前及转正前读取 GitHub 最新正式版本核实基准；过期计划停止发布并保留草稿，重新整理发布准备。Release 工作流串行执行，不取消进行中的发布。分类由开发者与 PR 审查判断，脚本只检查声明与版本计算，不自动理解功能范围。

同一公告是 GitHub Release 正文与软件“关于 → 版本”的来源。打包通过 `releaseInfo.releaseNotesFile` 写入 latest.yml.releaseNotes，使安装版与免安装版一致；公告缺失／空白／不一致不得转正。公告按纯文本展示，点击现有更新气泡进入版本页，不自动弹窗；详细实现与验证留在任务记录。

## 发布步骤

1. 使用上述命令准备版本和公告，核对最终差异、分类依据、验收和 CI 后整合到 main。
2. Windows x64／Node 24 执行 `npm ci`、`npm run build`、`npm test`、`npm run test:smoke`，运行两个 helper 文件测试。更新器改动还需 `node tests/update-packaged.mjs` 的独立 ID 升级／失败恢复验证，不使用当前真实桌宠。
3. `npm run dist` 产生两个 EXE、latest.yml 和 NSIS blockmap。执行 `node scripts/verify-release.mjs` 核对文件名、版本、大小、SHA-512 并生成两个 EXE 的 SHA256SUMS.txt；执行 `node scripts/verify-update-runtime.mjs` 检查 asar 内运行依赖、助手和固定发布源。
4. 经明确授权后创建并推送与包版本一致的新标签，例如 v0.5.3。保留旧标签，不修改已公开版本。
5. Release workflow 先拒绝覆盖已发布的同标签 Release，再测试、打包、验证；创建／更新**草稿 Release** 并上传下面五项。全部上传后重新查询 API，逐个核对 uploaded、文件名、字节数及 GitHub SHA-256 digest，再把草稿设为正式／latest。任一不完整则保留草稿，客户端不能发现半成品。

草稿通过分页 releases 集合按 tag 精确查询；按标签接口只返回已发布版本，不能用于草稿门禁。若标签发布中断，修复工作流后可从 Actions 手动运行 Release，填写既有稳定 `release_tag`；工作流使用主线定义、checkout 该标签源码打包，保留原标签和发布内容，不能覆盖已公开版本。

已有唯一草稿时，使用 `gh release upload --clobber` 替换五附件，再以 `--notes-file` 同步公告，不改 tag／target；不存在时由 action 使用同一公告文件新建草稿。两条路径都核对草稿正文和文件摘要后才转正。上传或公告同步失败继续保留草稿，不增加工作流权限；历史 T009 的元信息 403 与恢复结果见任务记录，新公告同步恢复路径需后续真实发布验证。

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
