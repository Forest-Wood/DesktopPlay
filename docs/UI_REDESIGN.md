# DesktopPet 前端重设计与超级调色盘交接索引（R041／R042）

- 更新日期：2026-11-22（Asia/Shanghai）。
- 状态：**已落地至当前开发分支（T035–T041，待审查／合并）**。
- 现行正式界面与数据契约已迁入 [DESIGN.md](../DESIGN.md)，不再在本文件重复维护“规划中”规格。
- 正式实拍预览见 [docs/previews/T041/README.md](previews/T041/README.md)；早期规划阶段的交互原型保留于 [docs/previews/T034/ui-mockup.html](previews/T034/ui-mockup.html)（仅作历史参考，不进入构建）。

## 已确认的用户决定

| # | 主题 | 结论 |
| --- | --- | --- |
| D1 | 改造范围 | 设置窗口与桌宠气泡同时升级 |
| D2 | 导航结构 | 采用 6 项导航：首页总览、伙伴、账户、提醒中心、人设工作室、系统 |
| D3 | 视觉风格 | 沿用白底＋鼠尾草侧栏＋松绿主色的安静浅色风格，新增参考 QQ“超级调色盘”的主题色自定义（R042） |
| D4 | 交付节奏 | 按功能边界拆分为 T034–T041 独立阶段交付与验证 |
| D5 | 2026-11-22 预览微调 | 人设工作室顶部条合并为 DeepSeek／GPT（内含原版与白龙档案）／Gemini；伙伴昵称支持自定义编辑；Gemini 气泡与首页卡显示订阅方案；气泡“更多”菜单在气泡上方以浮层遮盖展示，不挤占正文 |

## 任务与阶段索引

| 顺序 | 任务 | 分支 | 本地结果提交 | 当前状态 | 交付摘要 |
| --- | --- | --- | --- | --- | --- |
| 0 | [T034](tasks/T034-ui-redesign-plan.md) | `docs/T034-ui-redesign-plan` | `b07b82e` | 本地已提交，待审查 | 重设计规划、需求 R041／R042、原型与分阶段任务单 |
| 1 | [T035](tasks/T035-ui-foundation.md) | `feat/T035-settings-foundation` | `ef88296` | 已验证，待审查 | `tokens.css`、`ui/` 无状态组件、`router.ts`、6 项导航与草稿圆点／放弃修改 |
| 2 | [T036](tasks/T036-home-overview.md) | `feat/T036-home-overview` | `faea785` | 已验证，待审查 | 首页总览、`reminder-health.ts`、三账户卡、4 来源健康条与刷新全部 |
| 3 | [T037](tasks/T037-reminder-center.md) | `feat/T037-reminder-center` | `545a9a6` | 已验证，待审查 | 提醒中心来源矩阵、展开式接入向导、按当前人设试听／编辑与页底余额提醒 |
| 4 | [T038](tasks/T038-persona-studio.md) | `feat/T038-persona-studio` | `05d6deb` | 已验证，待审查 | 人设工作室、`AppSettings.petNicknames` 可编辑昵称及伙伴／账户／系统页视觉统一 |
| 5 | [T039](tasks/T039-pet-bubble-refresh.md) | `feat/T039-pet-bubble-refresh` | `2654ca9` | 已验证，待审查 | 页码点、气泡上方遮盖“更多”浮层、GPT 迷你环、Gemini 订阅方案、来源标签与等待琥珀高亮 |
| 6 | [T040](tasks/T040-super-palette.md) | `feat/T040-super-palette` | `46d5a0b` | 已验证，待审查 | `src/shared/theme.ts`、`AppSettings.theme`、8 预设／随心调／角色取色／`DP1.` 主题码与 AA 保护 |
| 7 | [T041](tasks/T041-ui-redesign-handoff.md) | `docs/T041-ui-redesign-handoff` | 未提交 | 文档与正式预览已完成，待审查 | 迁移规范至 `DESIGN.md`、更新 README 与 `docs/previews/T041/` 实拍图、精简本文与滚动清理 T039 |

## 保留说明与边界

- **暂未纳入本期**：自定义设置窗口背景图与深色主题仍保持未实现（固定 `color-scheme: light`），如需支持可另立新需求。
- **既有未决问题**：原生鼠标按住时的间歇位置偏移（见 T010／T014／T022）不属于本系列范围。
- **版本发布**：本系列仅完成开发与文档收尾，不单独升级版本号；是否发版及版本号由用户决定（按版本规则，T040 新增调色盘属于 `minor`）。
