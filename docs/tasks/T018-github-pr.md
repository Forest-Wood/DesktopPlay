# T018：优化 GitHub PR 创建流程

- 日期：2026-10-23（Asia/Shanghai）；负责人：Codex；关联需求：R025。
- 目标：避免已知无写权限的连接器反复返回 403，复用已验证可用的本机 Git 凭据和 PR 创建逻辑。
- 范围：仓库工作约定、可复用 Node.js 命令、隔离单测、需求及项目交接文档；不改产品行为、应用版本或 GitHub 授权。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`chore/T018-github-pr`；目标分支：main。
- 基准：`9dab76399a1986dcb23129b0b1bc2d36d484b88b`，2026-10-23 fetch 核实；PR #19／#20 均已合并到 main。开始时工作区干净，无带入修改。实现提交：`59b34ad4a45a6d15d6d4a566d0701422b579cf1c`；后续交接提交见 PR commits。
- 状态：本地实现与隔离验证完成；用户于 2026-10-23 进一步授权提交、推送和创建 PR，已通过登录成功的 gh 创建 [PR #21](https://github.com/Forest-Wood/DesktopPlay/pull/21)，待审查；不合并或发布。

## 实现与验收

- 授权状态未变时，不重复尝试已知返回 403 的连接器写入；读取仍可使用连接器。用户进一步选择 gh 后，已登录 gh 为首选，既有 Git 凭据脚本作为备用。
- `npm.cmd run pr:create -- <PR.json> [--check]` 固定当前仓库，拒绝缺失字段和额外字段；check 只做本地校验。
- 创建前查询同 head 的开放 PR，同基线复用，不同基线／结果歧义停止；POST 不自动重试。保留真实换行，不自动改已有 PR 的正文或基线。
- 只读已有 Git 凭据，令牌仅在内存中使用；错误不输出凭据、原始 HTTP 响应或子进程输出。不修改凭据、连接器权限或用户授权范围。
- 创建后仍由代理附加 PR 并核实远程；工具不自动提交、推送、合并或发布。

## 验证

- **通过**：`npm.cmd test -- tests/unit/github-pr.test.ts`，新增 16 项。覆盖查重、一次创建、基线不一致、非法输入在凭据／网络前拒绝、真实换行、凭据／HTTP 错误脱敏、POST 不自动重试、纯本地 check 及响应身份检查。
- **通过**：`npm.cmd run typecheck`；`node --check scripts/github-pr.mjs`。
- **环境失败／恢复**：默认沙箱临时目录下 `npm.cmd test` 出现 transform 缓存 ENOENT、临时 Git 配置写入拒绝及文件链接／改名 EPERM。将本次进程的 TEMP／TMP 指向工作区 `.tmp/T018-test-temp`，提权重跑同一套 `npm.cmd test` 后，26 文件／282 项全部通过；未改系统 ACL、应用沙箱或测试断言。
- **通过**：`npm.cmd run pr:create -- .tmp/T018-PR-check.json --check` 和 `npm.cmd run pr:create -- --help`；未读取真实凭据或创建 PR。命令输出仓库、head、base 的校验摘要。
- **通过**：文档严格 UTF-8／本地链接、`git diff --check`、版本三个字段仍为 1.0.1，无依赖变化。
- **gh 安装通过**：官方 `winget show --id GitHub.cli --exact --source winget` 核实 2.103.0，官方源安装包哈希验证及静默安装成功；`C:\Program Files\GitHub CLI\gh.exe --version` 返回 2.103.0（2026-10-21）。已通过本机 help 核对 PR list／create 和 run list 参数。
- **gh 登录通过**：初始 JSON 检查显示未登录；本次交付前 `gh auth status` 核实 Forest-Wood 账号已登录、使用 HTTPS。本次按 head 查询开放 PR 返回空列表；未改连接器授权，也未把已有 Git 凭据复制进 gh 配置。
- **本次提交前复验通过**：隔离 TEMP／TMP 为 `.tmp/T018-pr-review-temp`，`npm.cmd test` 26 文件／282 项直接通过（9.30 秒）；类型检查、脚本语法、CLI help／离线 check、UTF-8／本地链接与版本一致性检查通过。版本检查首次因 PowerShell JSON 对象不支持锁文件的空键失败，改用 `ConvertFrom-Json -AsHashtable` 后校验通过，未改锁文件或版本。
- **真实 gh 交付通过**：先按 head 查重，无开放 PR 后显式指定仓库、head、main 和正文文件，创建 PR #21，并附加到当前任务。首轮核实远程 head 为实现提交 `59b34ad`，9 个文件与本地一致，普通 PR 的 CI 已触发；交接提交后仍须核对最新 head 的检查。备用脚本不执行真实写入，不能把此次 gh 交付作为新增脚本真实写入验收。
- 不运行：应用构建与 Electron 冒烟；本次仅仓库维护命令和文档，不修改应用源码或运行时。

## 下一步

交付入口为 [GitHub PR 流程](../github.md) 和 AGENTS.md 中的调用约定。审查 [PR #21](https://github.com/Forest-Wood/DesktopPlay/pull/21)，合并前确认 [最新 head 的检查](https://github.com/Forest-Wood/DesktopPlay/pull/21/checks)；保留备用脚本尚未真实写入验收的限制。普通开发版本保持 1.0.1，合并与发布另行处理。
