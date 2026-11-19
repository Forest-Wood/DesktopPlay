# T032 · 应用内增量／差分更新（NSIS + Portable）

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R039](../REQUIREMENTS.md#r039应用内增量差分更新t032)。
- 负责人：Antigravity。
- 分支：`feat/T032-incremental-update`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`8930e89`（远程 `origin/main`）。
- 结果提交：见本分支最新提交（仅本地提交，未推送、未创建 PR、未打标签）。
- 已有未提交修改：开始任务前工作区位于 `chore/T031-prune-overdefensive-tests` 且存在已验证的 T031 未提交改动；经用户确认按选项 B 先在原分支本地提交 T031（`dcd4ecb`），再从 `origin/main`（`8930e89`）切出独立任务分支 `feat/T032-incremental-update`，两者无混入。
- 状态：已实现且全量验证通过，待审查（仅本地提交）。

## 目标与范围

设计并实现 DesktopPet Windows x64 安装版（NSIS）与免安装版（Portable）的增量／差分更新能力，避免每次版本发布重复下载 ~115 MiB 完整安装包，同时保持原有安全边界（固定公开 HTTPS 白名单域名、无凭据请求、完整 SHA-512／SHA-256 校验、原子替换与失败回滚）。另按用户要求将“前序未提交任务先在原分支本地提交再从主线切新分支”的冲突隔离规则写入 [AGENTS.md](../../AGENTS.md)。

## 第 2 步前置实测结论

1. **压缩方式与包体零增幅**：`scripts/package.mjs` 在同一次 `electron-builder --win nsis portable --x64` 构建中先打包 `nsis`（默认 `differentialPackage = true`，`app-64.7z` 自动使用非固实 `-ms=off`、1 MiB 字典 `-md=1m`、normal 压缩），同轮构建的 `portable` 直接复用该非固实归档，外壳均以 `SetCompress off` 嵌入。基础包体增幅为 `0 B`。
2. **NSIS 本地缓存核实**：Windows NSIS 安装模板默认将安装包复制到 `%LOCALAPPDATA%\desktopplay-updater\installer.exe`，本机已安装 `v2.0.2` 核实该缓存文件已存在（`120,451,469 B`，与线上发布一致）。
3. **块复用率与 Range 合并实测**：
   - 线上真实发布 `v2.0.1 → v2.0.2` NSIS `.blockmap` 比对：整包 `114.87 MiB`（`120,451,469 B`），复用 `107.10 MiB`（**93.24%**），实际差分下载 **`7.77 MiB`**（`6.76%`，缩减 93.24%，101 个 Range）。
   - 本地双版本实测 `v2.0.2 → v2.0.3`（主进程 +2 KiB、渲染进程 +1 KiB 改动）：
     - NSIS：整包 `114.74 MiB`，复用 **95.31%**，差分下载 **`5.38 MiB`**（`4.69%`，145 个 Range）。
     - Portable：整包 `114.43 MiB`，复用 **95.50%**，原始差分 **`5.15 MiB`**（142 个 Range）；引入 **`64 KiB` 间隔合并** 后请求数从 142 降至 **4 次**，下载 **`8.65 MiB`**（`7.56%`，仍缩减 **92.44%**）；本地流式 Rabin CDC 扫描耗时约 2.9 秒、峰值内存约 32 KiB。

## 重要设计与实现

1. **共享流式 Rabin CDC 块索引模块**（[src/shared/portable-blockmap.mjs](../../src/shared/portable-blockmap.mjs)、[src/shared/portable-blockmap.d.mts](../../src/shared/portable-blockmap.d.mts)）：
   - 零外部依赖，采用与 `electron-builder` 一致的 64B 滚动窗口、8–32 KiB 变长分块（GF(2) 63 次多项式 `0xbfe6b8a5bf378d83`）及 Node 内置 `sha256`（前 18 字节 base64）块摘要，输出 gzip JSON（`version: "2"`, `hash: "sha256-18"`）。
   - 提供 `buildPortableBlockMap`（支持 `AbortSignal` 即时取消）、`parsePortableBlockMap`（限制 4 MiB 解压上限并严格校验文件名、总长度与块长度之和）及 `planPortablePatch`（默认 `64 KiB` 拷贝间隔合并；若需下载占比 ≥ 85% 直接放弃差分转整包）。
2. **NSIS 安装版**（[src/main/services/installed-update.ts](../../src/main/services/installed-update.ts)）：
   - 开启 `disableDifferentialDownload = false`，保留 `autoDownload = false`、`autoInstallOnAppQuit = false`、`allowPrerelease = false`、`allowDowngrade = false`、`plainPath` 与安装前完整 SHA-512 校验；差分异常或缓存缺失由 `electron-updater` 自动回退整包下载。
3. **Portable 免安装版与传输安全**（[src/main/services/portable-update.ts](../../src/main/services/portable-update.ts)、[src/main/services/update-http.ts](../../src/main/services/update-http.ts)、[src/main/main.ts](../../src/main/main.ts)）：
   - `GithubUpdateTransport` 新增 `bytes()` 与 `downloadRange()`，继续严格限制固定公开 HTTPS 域名白名单、6 跳内手动校验重定向、`credentials: 'omit'`、不接受任意用户请求头，且强制校验 `206 Partial Content`、`Content-Range` 与精确字节长度。
   - `PortableUpdateBackend` 接收当前运行中的 `programPath`，优先下载新版 `DesktopPet-<ver>-Portable-x64.exe.blockmap` 并本地流式扫描 `programPath` 计算差异计划（即使从无 Portable blockmap 的旧版如 `v2.0.2` 升级亦可命中差分），拷贝未变块并拉取差异 Range 到 `.partial`，流式计算整文件 SHA-256 与 `SHA256SUMS.txt` 严格比对后原子重命名。
   - 任一步骤失败（缺索引、服务端返回 200、Range 异常、哈希不匹配等）清理 `.partial` 并无感降级为整包下载；若 `AbortSignal` 已取消则立即抛出并清理临时文件，不触发回退。
4. **进度、速率与 ETA**（[src/main/services/app-update.ts](../../src/main/services/app-update.ts)）：
   - `transferred` / `total` / `progress` / `bytesPerSecond` / `estimatedRemainingSeconds` 准确反映当前实际网络下载量；在 `transferred === 0`、已传回退或总字节变化（如差分回退整包）时重置速率滑动窗口；取消时清零进度与字节计数。
5. **构建与发布流水线**（[scripts/package.mjs](../../scripts/package.mjs)、[scripts/verify-release.mjs](../../scripts/verify-release.mjs)、[.github/workflows/release.yml](../../.github/workflows/release.yml)）：
   - `scripts/package.mjs` 打包完成后生成 `DesktopPet-<ver>-Portable-x64.exe.blockmap`；`verify-release.mjs` 升级为校验全部 6 项资产并解析校验 Portable blockmap 完整性；`release.yml` 草稿上传、替换与转正摘要门禁同步纳入该第 6 项资产。
6. **文档与 `T(N-2)` 滚动清理**：
   - 同步更新 `DESIGN.md`、`AGENTS.md`、`docs/release.md`、`docs/REQUIREMENTS.md` 与 `docs/PROJECT_STATE.md`。
   - 按 `T(N-2)` 规则清理 `T030` 非跟踪临时草稿（`.tmp/T030-handoff-pr.md`、`.tmp/T030-notes.md`、`.tmp/T030-PR.md`），保留跟踪文件、正式文档与最新两轮产物。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run build` | `feat/T032-incremental-update` 工作区 | 通过（`tsc --noEmit`、Vite、esbuild） |
| `npm.cmd test -- --reporter=dot` | 工作区 | 通过（29 文件、333 项全量通过；含 NSIS/Portable 差分、Range 合并、失败回退、取消不回退、ETA 回退重置、6 项发布资产与工作流门禁单测） |
| `npm.cmd run dist -- --config.electronDist=node_modules/electron/dist` | 工作区（首次直接 `npm run dist` 遇 Windows Defender 扫描锁定 `release\win-unpacked.tmp` 导致 `EPERM rename`；改用本地已解压 `node_modules/electron/dist` 复跑成功） | 通过，生成 6 项产物含 `DesktopPet-2.0.2-Portable-x64.exe.blockmap`（`126,609 B`） |
| `node scripts/verify-release.mjs` | 工作区 | 通过（校验全部 6 项更新资产与 `SHA256SUMS.txt`） |
| `node scripts/verify-update-runtime.mjs` | 工作区 | 通过（`Verified packaged updater runtime v2.0.2`） |
| `npx.cmd playwright test tests/smoke/app-update.spec.ts --output=.tmp/T032-smoke-results` | 工作区 | 通过（1/1，3.4s） |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/update-helper-fixtures.ps1` | 工作区 | 通过（7/7 全部 PASS） |
| `node tests/update-packaged.mjs` | 工作区（首次运行暴露两项测试夹具问题并已修复：① `electron-builder@26.15.3` 在无锁文件测试目录忽略 junction 传递依赖，改为测试夹具内联打包 `electron-updater`；② `GenericProvider` 默认多 Range 模式与生产 `GitHubProvider` 单 Range 不同，测试夹具补齐 `useMultipleRangeRequest: false` 对齐生产） | 通过（3/3 全部 PASS）：<br>- **NSIS `0.0.1 → 0.0.2`**：差分 `797,337 / 111,723,552 B`（**-99.29%**，10 次 Range，UI `total = 797,337 B`）；缓存复用 `0 B`；blockmap 404 回退整包 `111,723,552 B` 并安装成功，数据／路径／开机启动保持一致。<br>- **Portable `0.0.1 → 0.0.2`**：差分 `485,452 / 111,404,859 B`（**-99.56%**，4 次 Range，UI `total = 485,452 B`）；缓存复用 `0 B`；blockmap 404 回退整包 `111,404,859 B` 并完成原子替换与健康回执。<br>- **Portable 启动失败回滚**：备份恢复旧版 EXE 并成功重启 `0.0.1`。产物目录 `.tmp/T008-upgrade-8ne6rw` |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 仅本地提交本任务改动（不推送、不创建 PR、不打标签），等待用户进一步授权。

