# T012：版本命名规范与简短更新公告

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；需求 R017、R018；目标 main。
- 工作目录 `D:\desktop1\DesktopPlay`；分支 `feat/T012-release-policy`；基准 `5a978afb52a1919c19bc039e62398f1c2777f888`；实现提交 `5c6a286`（已推送），后续交接文档提交见本分支历史。
- 开始时工作区干净，无带入修改。实现及本地验证后，用户明确授权提交、推送并创建 PR；不合并、不创建标签或 Release。保持三个版本字段 0.5.4，历史发布与标签不变。
- 状态：已实现、本地验证并推送，已创建 [PR #13](https://github.com/Forest-Wood/DesktopPlay/pull/13)（非草稿，目标 main），待审查；未合并／发布。
- 交付前重新 fetch 确认远程 main 仍为 `5a978af`，与开发基准一致，无需同步或解决冲突；创建前核实无同名分支或 PR。GitHub 插件此前已确认创建接口权限不足，本次使用本机现有 Git 认证调用官方 API 创建，凭据未写入文件或输出。

## 实现与决定

- 明确 patch／minor／major 分别对应已有功能完善／部分桌宠新增／全部桌宠新增，发布只按最高档升一次并清零低位。修复即使覆盖全部仍用 patch；纯内部维护随下次用户功能发布合并。
- `release:prepare` 从显式基准计算版本，同步 package、lock 根包、APP_VERSION、对应公告及 `release-plan.json`（baseVersion／changeTypes）。同一计划重复执行不再递增；历史版本与已有本地标签拒绝准备；输入先整体校验再写入。
- `release:check` 校验版本字段、类型计算和公告。0.5.4 无计划可继续开发；其他版本缺计划拒绝。正式 Release 必须有计划，打包前与转正前读取 GitHub latest 再校验基准，过期失败且保留草稿；Release 串行，不取消进行中的发布。类型本身由 PR 说明，不自动推断代码语义。
- 公告文件为唯一来源，通常 3–6 条中文要点，不强行给小修补凑条目。打包包装器将其写入 latest.yml.releaseNotes；GitHub 新草稿使用 body_path，已有草稿替换附件后以 notes-file 同步正文，不改 tag／target。正文／元数据缺失、空白或不一致均阻止转正。
- 更新页沿用 releaseNotes／原有 IPC 与气泡入口，新增公告标题及目标版本／有效日期。空公告明确提示，纯文本显示；检查失败清除公告及日期，下载失败仍可保留与候选版本对应的公告。不新增自动弹窗。
- 文档与 PR 模板已接入规则；普通开发不提前升版本。本次未生成工作区发布计划，未更改已发布 v0.5.4 的说明或附件。

## 验证

- 通过：`npm.cmd run build`（含类型检查）；最终 `npm.cmd test` 23 文件／252 单测（7.65 秒）。早先四个相关文件 67 项、前一轮全量 251 项均通过；最后新增转正前基准过期阻断用例后全量 252 项通过。
- 通过：`npm.cmd run release:check` 确认 0.5.4 开发基线无需提前准备版本。覆盖三档、混合最高档、清零、重复准备、CLI、字段不一致、过期基准、历史与已有标签保护、缺失／空白／错公告，以及两种后端同一公告。
- 通过：隔离 Electron `app-update.spec.ts` 1/1（4.2 秒），验证标题／版本／空提示／长文案滚动且无横溢出／按钮可达／HTML 不执行／旧公告隐藏、草稿与原有更新调度。应用沙箱保持启用；软件渲染截图在忽略的 `.tmp/T012-update-announcement.png`。
- 通过：全新隔离副本以 patch 准备到 0.5.5，并执行 `npm.cmd run dist -- --config.directories.output=.tmp/packages`、`verify-release.mjs`、`verify-update-runtime.mjs`。两个 EXE ProductVersion 为 0.5.5；latest.yml.releaseNotes 与同一公告文件一致，五资源／SHA-256／SHA-512／asar 运行依赖检查通过。工作区三版本仍为 0.5.4，未生成真实发布计划；副本位置记录在忽略的 `.tmp/T012-package-root.txt`。
- 通过：公告长文案截图目视检查；最终差异、UTF-8、文档相对链接和 `git diff --check`。无新增依赖；原有 release-assets 与 PowerShell 门禁通过，未放宽断言或超时。
- 未运行：真实 GitHub 发布／新草稿／已有草稿恢复、真实账户或真实数据更新。未改下载、安装或恢复机制，不重复独立两版本升级实验；真实 PowerShell 门禁、现有后端测试及相关 smoke 用于本次变更验证。
- 保留：T010 本地原生鼠标间歇失败和 T009／T011 的真实环境限制见原任务；本次不修改原有鼠标断言或容差。

下一步：审查 PR #13 并查看远程 CI 实际结果，本地验证记录不代表 CI 已通过。合并与后续发布按后续授权处理，发布版本按实际修改组合确定。新独立任务 T013／R019。
