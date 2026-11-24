# T044 · 移除 Gemini 的独立 Argon 额度

- 日期为 2026-11-24（Asia/Shanghai），负责人为 Codex。
- 关联需求 [R045](../REQUIREMENTS.md#r045移除-gemini-的独立-argon-额度t044)。
- 工作目录为 `D:\desktop1\DesktopPlay`。实现分支为 `fix/T044-remove-argon-quota`，并入 `fix/T045-gpt-quota-numbers` 后共同提交审查，目标为 `main`。[PR #43](https://github.com/Forest-Wood/DesktopPlay/pull/43)
- 基准提交为 `1e51051`，实现提交为 `f8c7b16`。
- 基准工作区无未提交修改。本次改动包括 Gemini 额度解析和共享类型、设置及气泡界面、两组冒烟测试、额度单测及项目文档。

## 实现与验收

- Antigravity 与 agy 的额度响应只采纳 `gemini-weekly` 和 `gemini-5h`。服务返回的周额度作为展示依据，旧响应中的 Argon 字段直接忽略。
- 完整与简洁气泡、首页概览、账户页和浏览器演示统一按周额度、5 小时额度的顺序显示。`0%` 和「未提供」分别显示。完整气泡与账户页展示服务提供的重置时间和方案名称。
- 角色选择器副标题显示「周额度与 5 小时额度」。账户页在 780 CSS 像素及以下纵向排列，更宽时并排显示。沿用现有 IPC 方法、配置格式和 v2.2.0 版本号。

## 验证

| 检查 | 适用范围 | 结果 |
| --- | --- | --- |
| `npm.cmd run build` | T044 最终代码 | 通过，包含 TypeScript 检查和渲染层、Electron 构建 |
| `npm.cmd test -- tests/unit/services/gemini.test.ts tests/unit/renderer/quota.test.ts` | T044 额度解析和共用渲染行为 | 通过，2 个文件共 15 项 |
| `npm.cmd run test:smoke -- gemini.spec.ts home-overview.spec.ts --output=.tmp/T044-smoke-final` | T044 最终构建和隔离资料目录 | 通过，2 项。账户页在 1000 和 760 CSS 像素分别为双列和单列，目视核对了两种宽度、角色选择器和两种气泡 |
| 首次运行同一组 Electron 冒烟，输出 `.tmp/T044-smoke` | 初版实现 | 首页通过，Gemini 用例失败。角色选择器运行时会重建文案，初版只修改模板而被覆盖。将副标题移动到实际渲染函数后复验通过 |
| Vite `preview()`、Playwright 与无头 Edge | T044 最终 `dist`，浏览器演示数据 | 通过，角色选择器可见，两项演示额度出现在首页、账户页与气泡 |
| 已登录的 Antigravity 和 agy | 真实账号 | 未运行，旧字段与额度值通过隔离响应验证 |
| `git diff --check` | T044 工作区 | 通过 |

并入 T045 后在主工作区复验。构建、15 项定向单测以及 Gemini、首页总览、GPT 简洁模式、完整气泡与重置卡共 4 项隔离 Electron 冒烟均通过。整合验证命令见 [T045](T045-gpt-quota-numbers.md#验证)。

## 临时文件滚动清理

确认文件归属、Git 忽略状态和完整路径后，删除 `.tmp/T042-smoke`、`.tmp/T042-notes.md` 和 `.tmp/T042-PR.md`。发行公告继续保存在 [v2.2.0 公告](../releases/v2.2.0.md)。保留 T043 与 T044 的本地验证产物。

## 后续

PR #43 待审查。真实账户额度可在后续验收时对照客户端。
