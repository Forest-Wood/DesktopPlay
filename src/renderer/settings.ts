import { deepseekPeriod, localBalanceTime, zoneLabel } from '../shared/deepseek-time';
import { mountBubbleEditor } from './bubble-editor';
import './settings.css';
import './settings-workspace.css';
import type { AppSettings, AppState, DesktopApi, PetPersona, SoundSlot, CompletionSource } from '../shared/types';
import { validatePhraseDisplays } from '../shared/phrases';
import { decimalSetting, money, updateMoney } from './format';
import { localTime, quotaStatus, renderQuota } from './quota';
import { geminiStatus, geminiStatusChip, renderGeminiQuota } from './gemini-quota';
import { COMPLETION_SOURCES, petPersona } from '../shared/bubble-settings';
import { formatUpdateDownloadDetail } from '../shared/app-update';
import { APP_VERSION, GEMINI_PETS, GPT_DRAGON_PET, GPT_PET } from '../shared/defaults';
import { PersonaSoundPlayer } from './sounds';
import { mountSettingsRouter, settingsCategory, type SettingsPage } from './settings/router';
import { mountHome } from './settings/views/home';
import './ui/components.css';

function sameDraftValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftFields = Object.entries(left);
  const rightFields = right as Record<string, unknown>;
  return leftFields.length === Object.keys(right).length
    && leftFields.every(([key, value]) => Object.hasOwn(right, key) && sameDraftValue(value, rightFields[key]));
}

export function mountSettings(root: HTMLElement, api: DesktopApi, initial: AppState, demo: boolean) {
  let state = initial;
  let draftBase = initial.settings;
  let dirty = false;
  let saving = false;
  let draftRevision = 0;
  let stateRevision = 0;
  let operationTicket = 0;
  let disposed = false;
  let soundPersona: PetPersona = petPersona(initial);
  const soundWarnings = new Map<string, string>();
  const warningKey = (slot: SoundSlot) => `${soundPersona}:${slot}:${state.sounds[soundPersona][slot].revision}`;
  const preview = new PersonaSoundPlayer(api, (slot, text) => { if (!disposed) { soundWarnings.set(warningKey(slot), text); root.querySelector<HTMLElement>(`#sound-warning-${slot}`)!.textContent = text; } });
  root.innerHTML = `
    <div class="settings-shell">
      <aside class="sidebar"><a class="brand" href="#home"><span class="brand-mark"><img src="./assets/whale.png" alt=""></span><span>DesktopPet<small>让桌面多一点陪伴</small></span></a>
        <div class="nav-caption">我的桌面</div>
        <nav aria-label="设置分区"></nav>
        <button id="companion-shortcut" class="companion-card" type="button" aria-label="调整当前桌宠">
          <span class="companion-caption">此刻，陪在你身边</span>
          <span class="companion-stage"><img id="companion-image" alt=""></span>
          <strong id="companion-name"></strong><span id="companion-mode"></span>
          <span class="companion-link">调整小伙伴 <span aria-hidden="true">↗</span></span>
        </button>
        <div class="sidebar-footer"><span>DesktopPet</span><span>v${APP_VERSION}</span></div>
      </aside>
      <main class="settings-main">
        <header class="workspace-header"><div><div class="eyebrow">我的桌面 <span aria-hidden="true">/</span> <span id="category-label">首页总览</span></div><h1>桌宠的栖息地<span aria-hidden="true">✦</span></h1></div><span id="companion-presence" class="presence-chip"></span></header>
        ${demo ? '<div class="demo-banner" role="status">本地演示模式 · 账户和提醒使用示例数据。</div>' : ''}
        <div id="operation-status" class="operation-status" role="status" aria-live="polite"></div>
        <section id="overview" class="section"><div class="section-heading"><h2>余额概览</h2><span id="network-status" class="status-chip"></span></div>
          <div class="balance-grid"><article class="balance-card"><div class="card-label">当前账户余额 <span class="card-provider">DEEPSEEK</span></div><div id="total-balance" class="big-money">—</div><div class="balance-bottom"><span id="balance-updated">尚未更新</span><button id="refresh" class="light-button" type="button">↻ 刷新余额</button></div></article>
          <article class="today-card"><div class="card-label">今日已观测消费</div><div id="today-spent" class="today-money">—</div><span id="today-date"></span><p>一点一滴，记录今天的投入。</p></article></div>
          <div class="panel deepseek-period"><span class="period-label">当前计费时段</span><strong id="deepseek-period"></strong><details class="period-details"><summary>查看时段规则</summary><p id="deepseek-period-rule" class="hint"></p></details></div><div id="service-message" class="service-message" role="status"></div>
          <div class="panel key-panel"><div><h3>连接 DeepSeek 账户</h3><p id="key-state">添加 API Key 后，小鲸鱼会定期为你查看余额。</p></div><form id="key-form"><label class="sr-only" for="api-key">DeepSeek API Key</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="输入新的 API Key" maxlength="512"><button id="save-key" type="submit" class="primary-button">保存 Key</button><button id="clear-key" type="button" class="text-button">移除</button></form><p class="hint">已保存的 Key 不会回显；余额查询直接由桌面应用发起。</p></div>
        </section>
        <section id="codex" class="section codex-section"><div class="section-heading"><h2>Codex 编程额度</h2><span id="codex-status" class="status-chip"></span></div><div class="panel"><div id="codex-quotas" class="quota-cards"></div><div class="codex-actions"><span id="codex-updated" class="hint"></span><div class="button-row"><button id="refresh-codex" type="button" class="secondary-button">↻ 刷新额度</button><button id="choose-codex" type="button" class="text-button">选择 codex.exe</button><button id="codex-usage" type="button" class="text-button">查看使用量 ↗</button></div></div><p class="hint">读取本机已登录的 Codex；未连接时请安装并登录 Codex，也可选择 codex.exe。</p></div></section>
        <form id="settings-form">
          <section id="appearance" class="section"><div class="section-heading"><h2>角色造型</h2><span class="section-note">切换角色与图片立即生效</span></div>
            <div class="panel"><div class="pet-selector" role="group" aria-label="切换内置桌宠"><button id="select-deepseek" type="button" class="pet-option" aria-pressed="false"><img src="./assets/whale.png" alt=""><span>DeepSeek 小鲸鱼<small>账户余额与消费</small></span></button><button id="select-gpt" type="button" class="pet-option" aria-pressed="false"><img src="./assets/gpt.png" alt=""><span>GPT 小伙伴<small>Codex 额度与重置时间</small></span></button><button id="select-gemini" type="button" class="pet-option" aria-pressed="false"><img src="${GEMINI_PETS.classic.url}" alt=""><span>Gemini<small>Argon 与 Gemini 剩余额度</small></span></button></div>
            <div id="gemini-appearance-options" hidden><p class="hint">两种 Gemini 造型共用同一份额度、陪伴短句、音效与气泡设置。</p><div class="pet-selector" role="group" aria-label="Gemini 造型">${(['classic', 'sketch'] as const).map(id => `<button id="gemini-${id}" type="button" class="pet-option" aria-pressed="false"><img src="${GEMINI_PETS[id].url}" alt=""><span>${id === 'classic' ? '经典<small>星光紫经典造型</small>' : '手绘<small>彩铅手绘风造型</small>'}</span></button>`).join('')}</div></div>
            <div id="gpt-appearance-options"><p class="hint">GPT 造型切换不影响 Codex 额度，两种内置造型共用同一份额度。</p><div class="pet-selector" role="group" aria-label="GPT 造型"><button id="appearance-classic" type="button" class="pet-option" aria-pressed="false"><img src="${GPT_PET.url}" alt=""><span>原版 GPT<small>薄荷绿小伙伴</small></span></button><button id="appearance-dragon" type="button" class="pet-option" aria-pressed="false"><img src="${GPT_DRAGON_PET.url}" alt=""><span>GPT 白龙<small>淡紫色小伙伴</small></span></button><button id="appearance-custom" type="button" class="pet-option" aria-pressed="false"><span>自定义图片<small>保留已导入的造型</small></span></button></div></div>
            <div class="pet-preview-row"><div class="pet-preview"><img id="pet-preview-image" alt="当前桌宠角色"></div><div><h3 id="pet-name"></h3><p>点击桌宠查看余额或剩余额度，拖动它换个位置。<br>右键打开快捷菜单。</p><div class="button-row"><button id="choose-pet" type="button" class="secondary-button">换一张图片</button><button id="reset-pet" type="button" class="text-button">恢复当前角色</button></div></div></div>
            <div class="setting-row"><label for="pet-mode">桌宠模式<small>所有桌宠共用；保存后生效。简洁模式只保留剩余额度、完成及问答提醒，原设置仍保留。</small></label><select id="pet-mode" name="petMode" form="settings-form"><option value="full">完整模式</option><option value="simple">简洁模式</option></select></div><div class="setting-row"><label for="scale">角色大小<small>屏幕空间不足时自动缩小，保留所选比例</small></label><div class="range-control"><input id="scale" name="scale" type="range" min="0.5" max="2" step="0.05"><output id="scale-output" for="scale"></output></div></div>
            <div class="setting-row"><label for="volume">音效音量<small>点击音效音量；完成音效在气泡与提示中独立设置</small></label><div class="range-control"><input id="volume" name="volume" type="range" min="0" max="1" step="0.05"><output id="volume-output" for="volume"></output></div></div>
            <div class="toggle-grid"><label class="toggle-label"><span>启用点击音效</span><input name="soundEnabled" type="checkbox"></label><label class="toggle-label"><span>始终置于顶层</span><input name="alwaysOnTop" type="checkbox"></label><label class="toggle-label"><span>贴近边缘时自动吸附</span><input name="snapToEdges" type="checkbox"></label><label class="toggle-label"><span>开机自动启动</span><input name="launchAtLogin" type="checkbox"></label></div>
            <label class="field-label" for="phrases">陪伴短句 <span>每行一句</span></label><textarea id="phrases" name="phrases" rows="3" maxlength="4000" placeholder="今天也要照顾好自己呀。"></textarea></div>
          </section>
          <section id="reminders" class="section"><div class="section-heading"><h2>余额提醒</h2><span class="section-note">轻轻提醒，安心工作</span></div><div class="panel reminder-grid"><div><label class="field-label" for="low-balance">余额低于</label><input id="low-balance" name="lowBalanceThreshold" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">以账户币种计算，留空关闭低余额提醒。</p></div><div><label class="field-label" for="daily-budget">今日观测消费达到</label><input id="daily-budget" name="dailyBudget" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">按电脑当前时区分段、每日统计，留空关闭预算提醒。</p></div></div></section>
          <div class="save-bar" data-dirty="false"><div class="save-copy"><span class="save-indicator" aria-hidden="true"></span><span id="save-hint" role="status" aria-live="polite">设置已同步</span></div><div class="save-actions"><button id="discard-settings" type="button" class="text-button" disabled>放弃修改</button><button id="save-settings" type="submit" class="primary-button">保存设置</button></div></div>
        </form>
        <section id="records" class="section"><div class="section-heading"><h2>消费记录</h2><span id="records-zone" class="section-note"></span></div><div class="panel"><p id="records-period" class="hint"></p><div class="table-scroll"><table><caption class="sr-only">每日已观测消费及余额增加</caption><thead><tr><th scope="col">日期／统计时区</th><th scope="col">已观测消费</th><th scope="col">余额增加</th></tr></thead><tbody id="history-body"></tbody></table></div><div class="statistics-note"><strong>这些数字代表什么？</strong><p>消费是两次余额观测之间的下降量，不是逐次调用账单。应用关闭或断网期间的变化只能在下一次观测时发现；同时发生的充值与消费可能相互抵消。每日首次成功观测建立起点，跨午夜差额不计入新一天；仅同一统计分段、当日相邻观测下降累计。切换电脑时区会建立新分段；旧记录保留原北京时间口径。</p><p>DesktopPet 不提供 AI 聊天，也不估算每轮对话费用。金额展示保留 2 位小数，内部记录保留 8 位。</p></div></div></section>
        <footer class="page-footer">让每一天，都有一个小伙伴陪着。 ✦</footer>
      </main>
    </div>`;
  const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  // Retain the account actions and input identities while giving every page its own viewport.
  const main = root.querySelector<HTMLElement>('.settings-main')!;
  const settingsForm = element<HTMLFormElement>('settings-form');
  const content = document.createElement('div'); content.className = 'settings-content';
  main.append(content);
  const home = document.createElement('section');
  home.id = 'home';
  home.className = 'section';
  content.append(home);
  const makePage = (id: string, title: string, html: string) => {
    const section = document.createElement('section'); section.id = id; section.className = 'section'; section.innerHTML = `<div class="section-heading"><h2>${title}</h2></div><div class="panel">${html}</div>`; content.append(section); return section;
  };
  for (const id of ['overview', 'codex', 'appearance', 'reminders', 'records']) content.append(element(id));
  const geminiSection = makePage('gemini', 'Gemini 剩余额度', '<div id="gemini-quotas"></div><div class="codex-actions"><p id="gemini-status" class="hint" role="status"></p><div class="button-row"><button id="refresh-gemini" class="secondary-button" type="button">↻ 刷新额度</button></div></div><p class="hint">优先读取本机运行中的 Antigravity 实时额度；客户端关闭时回退到已登录的 agy CLI。</p>');
  geminiSection.querySelector('.section-heading')!.insertAdjacentHTML('beforeend', '<span id="gemini-status-chip" class="status-chip"></span>');
  const behavior = makePage('behavior', '桌面行为', '<p class="page-description">让小伙伴按你的习惯，留在桌面上。</p>');
  const sound = makePage('sound', '声音', '<p class="page-description">给每次轻轻按下，留一点回应。</p>');
  makePage('bubbles', '气泡与提示', '<div id="bubble-editor"></div>');
  makePage('completion', '对话提醒', `<label class="toggle-label"><span>监听 Codex 成功完成事件</span><input id="completion-enabled" name="codexCompletionEnabled" type="checkbox"></label>
    <label class="field-label" for="completion-directory">Codex 主目录</label><p id="completion-status" class="hint" role="status"></p><p id="completion-current-directory" class="hint completion-path"></p><input id="completion-directory" type="text" readonly><div class="button-row"><button id="completion-choose-directory" class="secondary-button" type="button">选择目录</button><button id="completion-default-directory" class="text-button" type="button">使用默认目录</button><button type="button" class="text-button" data-edit-completion="codex">编辑 Codex 提示</button></div>
    <p class="hint">选择包含 sessions 的 Codex 主目录，一般为 .codex。只读监听，不补发历史。</p>
    <label class="toggle-label"><span>监听 ChatGPT Work 原生结束通知</span><input name="chatgptCompletionEnabled" type="checkbox"></label><p id="chatgpt-completion-status" class="hint" role="status"></p><p class="hint">请在 ChatGPT 桌面应用中将回合结束通知设为“始终”（Always）。这里只接收原生结束通知，失败或中止也会提醒；启动前的通知不会补弹。</p><button type="button" class="text-button" data-edit-completion="chatgpt-work">编辑 Work 提示</button>
    <label class="toggle-label"><span>监听 DeepSeek Harness 成功完成事件</span><input name="deepseekCompletionEnabled" type="checkbox"></label><p id="dsh-completion-status" class="hint" role="status"></p><p id="dsh-current-directory" class="hint completion-path"></p><label class="field-label" for="dsh-directory">DSH 会话目录</label><input id="dsh-directory" type="text" readonly><div class="button-row"><button id="dsh-choose-directory" class="secondary-button" type="button">选择会话目录</button><button id="dsh-default-directory" class="text-button" type="button">使用默认目录</button><button type="button" class="text-button" data-edit-completion="deepseek-harness">编辑 DSH 提示</button></div><p class="hint">默认 DSH_HOME/sessions，未设置时为 ~/.dsh/sessions。支持本机 v4 普通与压缩日志；目录及开关保存后生效。隐藏桌宠时不提醒。</p>`);
  const phrases = makePage('companionship', '陪伴短句', '<p class="page-description">各角色独立保存。自定义 GPT 图片使用原版 GPT 短句。</p><div class="persona-tabs" role="group" aria-label="短句人设"><button type="button" data-persona="whale">小鲸鱼</button><button type="button" data-persona="gpt">原版 GPT</button><button type="button" data-persona="dragon">白龙</button><button type="button" data-persona="gemini">Gemini</button></div><div class="phrase-preview"><img id="phrase-preview-image" alt=""><p id="phrase-preview-text"></p></div><label class="field-label" for="phrases">陪伴短句 <span>每行一句 · 保存后生效</span></label>');
  phrases.querySelector('.panel')!.append(element<HTMLTextAreaElement>('phrases'));
  phrases.querySelector('.panel')!.insertAdjacentHTML('beforeend', '<div class="phrase-display-controls"><label class="field-label" for="phrase-count">每轮展示数量 N</label><input id="phrase-count" name="phraseCount" form="settings-form" type="number" min="0" max="20" step="1"><label class="field-label" for="phrase-mode">展示模式</label><select id="phrase-mode" name="phraseMode" form="settings-form"><option value="sequential">按顺序切换</option><option value="random">随机展示</option></select><p class="hint">0 表示关闭短句页。勾选至少 N 条候选；每轮每页展示一句。顺序模式接着上轮看过的位置继续。</p><div id="phrase-candidates" role="group" aria-label="候选短句"></div></div>');
  element('completion').querySelector('.panel')!.insertAdjacentHTML('afterbegin', `<h3>等待回应提醒</h3><p class="hint">提问卡片、填写请求和审批弹窗触发提醒；普通正文里的追问不识别。气泡按所选方式关闭，隐藏或退出时清空；回应仍在原客户端完成。</p>
    <label class="toggle-label"><span>ChatGPT App 等待回应<small>覆盖聊天、Work 和 App 内 Codex。</small></span><input name="attention-chatgpt-work" type="checkbox"></label>
    <p id="chatgpt-attention-status" class="hint" role="status"></p><p id="chatgpt-attention-directory" class="hint completion-path"></p>
    <ol class="integration-steps"><li>在 ChatGPT 设置的通知页面开启“提问”和“权限”通知，并允许系统通知。</li><li>切换到其他会话或应用，再触发一次提问卡片或审批；正在查看的会话沿用 ChatGPT 原生规则，不重复提醒。</li><li>状态出现“已收到等待回应事件”和时间后，表示事件链路已接通。</li></ol>
    <label class="toggle-label"><span>Codex CLI／VS Code 等待回应<small>接入后有提问或审批就提醒，包括正在查看的会话。</small></span><input name="attention-codex" type="checkbox"></label>
    <label class="toggle-label"><span>启用 Codex CLI／IDE hook 接入<small>保存后合并 hooks.json 并备份；关闭后只移除 DesktopPet 的配置。</small></span><input name="codexHookEnabled" type="checkbox"></label>
    <p id="codex-attention-status" class="hint" role="status"></p><p id="codex-attention-directory" class="hint completion-path"></p><p id="codex-attention-draft" class="hint" hidden>接入设置尚未保存，当前仍使用已保存的设置。</p>
    <ol class="integration-steps"><li>开启上方 hook 接入，点击底部“保存设置”；保存后检查客户端是否支持接入。</li><li>在使用上述主目录的 Codex CLI 输入 /hooks，审阅并信任 DesktopPet 转发项。桌宠不会代为信任。</li><li>保存工作并重新加载 VS Code，再新建 Codex 会话触发提问或审批；状态显示收到事件后接入完成。若仍等待，请核对 VS Code 使用的 Codex 主目录。</li></ol>
    <label class="toggle-label"><span>DeepSeek Harness 等待回应</span><input name="attention-deepseek-harness" type="checkbox"></label><h3 class="completion-section-title">完成提醒</h3>`);
  element('appearance').querySelector('label[for="phrases"]')!.remove();
  // Group completion and waiting controls by the app the user wants to connect.
  // Move existing controls so their identities, draft values and form association stay intact.
  const completionPanel = element('completion').querySelector<HTMLElement>('.panel')!;
  const waitingLabel = (source: CompletionSource) => root.querySelector<HTMLInputElement>(`input[name="attention-${source}"]`)!.closest('label')!;
  const completedLabel = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.closest('label')!;
  const siblingsUntil = (start: Element, end: Element | null): Element[] => {
    const nodes: Element[] = [];
    for (let node: Element | null = start; node && node !== end; node = node.nextElementSibling) nodes.push(node);
    return nodes;
  };
  const geminiControls = document.createElement('div');
  geminiControls.innerHTML = `<label class="toggle-label"><span>需要回应时提醒</span><input name="attention-antigravity" type="checkbox"></label>
    <label class="toggle-label"><span>完成时提醒</span><input name="geminiCompletionEnabled" type="checkbox"></label>
    <label class="toggle-label"><span>接入 Antigravity 完成 hook<small>可选；用于补充 agy CLI 完成提醒并区分错误／取消中止。保存后写入全局 hooks.json，关闭只移除 DesktopPet 的条目。</small></span><input name="geminiHookEnabled" type="checkbox"></label>
    <p id="gemini-integration-status" class="hint" role="status"></p><p class="hint">App、VS Code 与 IDE 的完成及等待回应均自动只读监听本机会话摘要，无需配置 hook；启用完成 hook 后请在 Antigravity 中重新加载会话。</p>
    <button type="button" class="text-button" data-edit-completion="antigravity">编辑提示</button>`;
  const integrations = [
    { source: 'antigravity', title: 'Gemini · Antigravity', description: '桌面 App、VS Code／IDE 和 agy CLI', nodes: [...geminiControls.children] },
    { source: 'codex', title: 'Codex', description: 'CLI 与 VS Code 中的编程任务', nodes: [
      ...siblingsUntil(waitingLabel('codex'), waitingLabel('deepseek-harness')),
      ...siblingsUntil(completedLabel('codexCompletionEnabled'), completedLabel('chatgptCompletionEnabled')),
    ] },
    { source: 'chatgpt-work', title: 'ChatGPT App', description: 'Work 完成，以及 App 内的提问与审批', nodes: [
      ...siblingsUntil(waitingLabel('chatgpt-work'), waitingLabel('codex')),
      ...siblingsUntil(completedLabel('chatgptCompletionEnabled'), completedLabel('deepseekCompletionEnabled')),
    ] },
    { source: 'deepseek-harness', title: 'DeepSeek Harness', description: '本机任务完成与等待回应', nodes: [
      ...siblingsUntil(waitingLabel('deepseek-harness'), completionPanel.querySelector('.completion-section-title')),
      ...siblingsUntil(completedLabel('deepseekCompletionEnabled'), null),
    ] },
  ];
  completionPanel.replaceChildren();
  completionPanel.insertAdjacentHTML('beforeend', '<p class="page-description">先选择要接收提醒的应用。完成与等待提醒独立开关，接入说明按需展开；所有开关保存后生效。</p>');
  for (const integration of integrations) {
    const card = document.createElement('article'); card.className = 'integration-card'; card.dataset.source = integration.source;
    card.innerHTML = `<div class="integration-heading"><div><h3>${integration.title}</h3><p>${integration.description}</p></div></div><div class="integration-toggles"></div><div class="integration-statuses"></div><details class="integration-details"><summary>接入与目录设置</summary><div class="integration-configuration"></div></details>`;
    for (const node of integration.nodes) {
      const control = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (control && !['codexHookEnabled', 'geminiHookEnabled'].includes(control.name)) {
        const label = node.querySelector('span')!;
        label.textContent = control.name.startsWith('attention-') ? '需要回应时提醒' : '完成时提醒';
        card.querySelector('.integration-toggles')!.append(node);
      } else if (node.id.endsWith('-status') || node.id === 'codex-attention-draft') {
        card.querySelector('.integration-statuses')!.append(node);
      } else card.querySelector('.integration-configuration')!.append(node);
    }
    const edit = card.querySelector<HTMLButtonElement>('[data-edit-completion]')!;
    edit.textContent = '编辑提示 ↗'; card.querySelector('.integration-heading')!.append(edit);
    completionPanel.append(card);
  }
  const toggles = element('appearance').querySelector('.toggle-grid')!;
  for (const name of ['alwaysOnTop', 'snapToEdges', 'launchAtLogin']) behavior.querySelector('.panel')!.append(root.querySelector(`input[name="${name}"]`)!.closest('label')!);
  sound.querySelector('.panel')!.append(root.querySelector('input[name="soundEnabled"]')!.closest('label')!);
  sound.querySelector('.panel')!.append(element('volume').closest('.setting-row')!); toggles.remove();
  const soundProfiles = document.createElement('div'); soundProfiles.className = 'sound-profiles';
  soundProfiles.innerHTML = `<p class="hint">各角色的按下与松开音效独立保存。更换与恢复立即生效，音量及开关需保存设置。</p><div class="persona-tabs" role="group" aria-label="音效角色"><button type="button" data-sound-persona="whale">小鲸鱼</button><button type="button" data-sound-persona="gpt">原版 GPT</button><button type="button" data-sound-persona="dragon">白龙</button><button type="button" data-sound-persona="gemini">Gemini</button></div>${(['press', 'release'] as const).map(slot => `<article class="sound-file"><div class="sound-file-heading"><h3>${slot === 'press' ? '按下音效' : '松开音效'}</h3><span id="sound-kind-${slot}" class="sound-kind"></span></div><p id="sound-name-${slot}" class="sound-filename"></p><div class="button-row"><button id="sound-choose-${slot}" type="button" class="secondary-button">更换音频</button><button id="sound-preview-${slot}" type="button" class="secondary-button">试听</button><button id="sound-stop-${slot}" type="button" class="text-button">停止</button><button id="sound-reset-${slot}" type="button" class="text-button">恢复内置音效</button></div><p id="sound-warning-${slot}" class="sound-warning" role="status"></p></article>`).join('')}<p class="hint">试听使用当前音量草稿；即使关闭点击音效，也可以试听。音量为零时不会播放。</p>`;
  sound.querySelector('.panel')!.append(soundProfiles);
  sound.querySelector('.panel')!.insertAdjacentHTML('beforeend', '<div class="related-settings"><h3>对话完成音效</h3><p>每个应用的完成音效可独立开关、调节音量和更换音频。</p><div class="button-row"><button type="button" class="secondary-button" data-edit-sound="codex">Codex 音效 ↗</button><button type="button" class="secondary-button" data-edit-sound="chatgpt-work">Work 音效 ↗</button><button type="button" class="secondary-button" data-edit-sound="deepseek-harness">DSH 音效 ↗</button><button type="button" class="secondary-button" data-edit-sound="antigravity">Gemini 音效 ↗</button></div></div>');
  element('overview').insertAdjacentHTML('beforeend', '<div class="related-links"><button type="button" class="text-button" data-settings-page="records">查看消费记录 →</button><button type="button" class="text-button" data-settings-page="reminders">设置余额提醒 →</button></div>');
  element('bubbles').insertAdjacentHTML('afterbegin', '<div class="related-links bubble-links"><span>提醒来源与声音开关</span><button type="button" class="text-button" data-settings-page="completion">对话提醒 →</button><button type="button" class="text-button" data-settings-page="sound">声音设置 →</button></div>');
  makePage('version', '关于 DesktopPet', `<div class="about-hero"><span class="brand-mark">≈</span><div><h3>DesktopPet <span class="version-chip">v${APP_VERSION}</span></h3><p>让桌面多一点陪伴。</p></div></div><p>小鲸鱼陪你关注余额，GPT 小伙伴与白龙陪你照顾编程节奏，Gemini 星猫陪你留意 Antigravity 额度与回应。</p><p class="hint">原有账户、图片、记录和桌面位置会继续保留。</p><div class="about-detail">项目仓库 · Forest-Wood / DesktopPlay<br>代码许可证 · MIT</div>`);
  element('version').querySelector('.panel')!.insertAdjacentHTML('beforeend', `<section class="app-update"><h3>软件更新</h3><p id="update-mode" class="hint"></p><p id="update-status" role="status"></p><p id="update-checked" class="hint"></p><progress id="update-progress" max="100" value="0" hidden></progress><p id="update-bytes" class="hint"></p><p id="update-error" class="sound-warning" role="alert"></p><section id="update-announcement" aria-labelledby="update-notes-title" hidden><h4 id="update-notes-title">更新公告</h4><p id="update-notes-version" class="hint"></p><pre id="update-notes" class="update-notes"></pre></section><div class="button-row"><button id="update-check" type="button" class="secondary-button">检查更新</button><button id="update-download" type="button" hidden>下载更新</button><button id="update-cancel" type="button" class="secondary-button" hidden>取消下载</button><button id="update-install" type="button" hidden>重启并更新</button></div><label class="toggle-label"><span>自动检查更新<small>启动后自动检查，之后每 6 小时检查；下载和重启由你决定。</small></span><input id="auto-check-updates" name="autoCheckUpdates" type="checkbox"></label><div id="update-dirty-dialog" class="update-dirty-dialog" hidden><p>有未保存的设置，请先保存，或选择放弃草稿后重启更新。</p><div class="button-row"><button id="update-save-first" type="button">保存设置</button><button id="update-discard" class="secondary-button" type="button">放弃草稿并更新</button><button id="update-keep-editing" class="text-button" type="button">继续编辑</button></div></div></section>`);
  makePage('guide', '使用说明', '<div class="guide-list"><article><h3>轻点一下，看看近况</h3><p>点击桌宠翻阅余额、额度与陪伴短句；点击气泡关闭按钮收起。</p></article><article><h3>拖到喜欢的位置</h3><p>按住桌宠拖动，可在桌面行为中启用贴边吸附。靠近屏幕上方时，小伙伴会倒挂陪着你。</p></article><article><h3>连接你的账户</h3><p>DeepSeek 使用 API Key 查询余额；Codex 与 Gemini 读取本机登录状态与官方返回的额度。没有返回的窗口显示“未提供”。</p></article><article><h3>保存你的小习惯</h3><p>切换页面会保留草稿。完成后点击底部“保存设置”。角色与账户操作即时生效。</p></article></div>');
  makePage('licenses', '素材与许可证', '<div class="guide-list"><article><h3>代码与开源来源</h3><p>代码采用 MIT 许可证。部分代码参考 MeteorNOX / DeepSeek-Balance-Whale-Widget，并保留上游署名与许可证。</p></article><article><h3>小鲸鱼与音效</h3><p>源自上游项目，维护者确认获得独立分发授权。美术与声音素材不随代码转为 MIT 授权。</p></article><article><h3>GPT、白龙与 Gemini</h3><p>根据用户参考与提供素材制作的非官方形象，不代表 OpenAI 或 Google 的官方吉祥物、合作或认可。第三方商标权归原权利人。</p></article><article><h3>完整声明</h3><p>随应用分发的 LICENSE 与 THIRD_PARTY_NOTICES.md 包含完整许可证、素材来源与授权边界。</p></article></div>');
  makePage('uninstall', '卸载 DesktopPet', '<p class="page-description">移除程序，并按你的选择清理本机数据。</p><dl class="uninstall-paths"><dt>运行模式</dt><dd id="uninstall-kind">正在检查…</dd><dt>程序位置</dt><dd id="uninstall-program">正在检查…</dd><dt>用户数据位置</dt><dd id="uninstall-data">正在检查…</dd></dl><label class="toggle-label uninstall-delete-label" for="uninstall-remove-data"><span>同时删除本机用户数据<small>默认开启，可关闭以保留设置与素材。</small></span><input id="uninstall-remove-data" type="checkbox" checked></label><p class="hint">清理范围：API Key、设置、余额与消费记录、自定义图片、自定义音频和缓存。同一用户运行的安装版与免安装版可能共用这些数据，清理会同时影响它们。</p><p id="uninstall-reason" class="sound-warning" role="status"></p><button id="uninstall-start" class="uninstall-button" type="button" disabled>卸载 DesktopPet</button><p class="hint">点击后会显示系统确认对话框，取消即可返回。</p>');
  const saveBar = root.querySelector<HTMLElement>('.save-bar')!;
  const discardButton = element<HTMLButtonElement>('discard-settings');
  const setSaveHint = (message: string) => {
    saveBar.dataset.dirty = String(dirty);
    discardButton.disabled = !dirty || saving;
    const hint = element('save-hint');
    if (hint.textContent !== message) hint.textContent = message;
  };
  // Keep the actual character in view before the immediate appearance actions.
  const appearancePanel = element('appearance').querySelector<HTMLElement>('.panel')!;
  appearancePanel.prepend(root.querySelector<HTMLElement>('.pet-preview-row')!);
  root.querySelector('.pet-preview-row')!.after(element('pet-mode').closest('.setting-row')!);
  main.append(content, saveBar);
  element<HTMLButtonElement>('save-settings').setAttribute('form', 'settings-form');
  for (const id of ['update-download', 'update-install', 'update-save-first']) element(id).classList.add('primary-button');
  for (const control of content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name], textarea[name]')) control.setAttribute('form', 'settings-form');
  settingsForm.hidden = true;
  root.querySelector('.page-footer')!.remove();
  const router = mountSettingsRouter(root, content, initial.activePet === 'gemini' ? 'gemini' : initial.activePet === 'gpt' ? 'codex' : 'overview', page => {
    renderPeriod();
    if (page === 'gemini') void api.refreshGeminiQuota().catch(() => {});
    preview.stop();
    bubbleEditor.stopAudio();
  });
  root.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); router.navigate('home'); });
  element('companion-shortcut').addEventListener('click', () => router.navigate('pet', 'appearance', 'tab'));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-settings-page]')) {
    button.addEventListener('click', () => {
      const page = button.dataset.settingsPage as SettingsPage;
      router.navigate(settingsCategory(page), page, 'tab');
    });
  }
  let persona: PetPersona = petPersona(initial);
  let phraseDraft: Record<PetPersona, string[]> = structuredClone(initial.settings.phrasesByPersona);
  let phraseDisplayDraft = structuredClone(initial.settings.phraseDisplayByPersona);
  const phraseInput = element<HTMLTextAreaElement>('phrases');
  const capturePhrases = () => {
    const old = phraseDraft[persona], selected = new Set(phraseDisplayDraft[persona].selectedIndices), used = new Set<number>();
    const lines = phraseInput.value.split('\n').map(line => line.trim()).filter(Boolean);
    phraseDisplayDraft[persona].selectedIndices = lines.flatMap((line, index) => {
      const previous = old.findIndex((text, at) => text.trim() === line && !used.has(at));
      if (previous >= 0) used.add(previous);
      return previous < 0 || selected.has(previous) ? [index] : [];
    });
    phraseDraft[persona] = lines;
  };
  const previewPhrases = () => {
    element<HTMLImageElement>('phrase-preview-image').src = persona === 'gemini' ? GEMINI_PETS[state.geminiAppearance].url : persona === 'whale' ? './assets/whale.png' : persona === 'dragon' ? GPT_DRAGON_PET.url : GPT_PET.url;
    element('phrase-preview-text').textContent = phraseInput.value.split('\n').find(line => line.trim()) ?? '写一句话，给今天一点陪伴。';
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-persona]')) button.setAttribute('aria-pressed', String(button.dataset.persona === persona));
    element<HTMLInputElement>('phrase-count').value = String(phraseDisplayDraft[persona].count);
    element<HTMLSelectElement>('phrase-mode').value = phraseDisplayDraft[persona].mode;
    const candidates = element('phrase-candidates'); candidates.replaceChildren();
    for (const [index, text] of phraseDraft[persona].entries()) {
      const label = document.createElement('label'); label.className = 'toggle-label';
      const caption = document.createElement('span'); caption.textContent = text;
      const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('form', 'settings-form'); check.dataset.phraseIndex = String(index); check.checked = phraseDisplayDraft[persona].selectedIndices.includes(index);
      check.addEventListener('change', () => { const indices = new Set(phraseDisplayDraft[persona].selectedIndices); if (check.checked) indices.add(index); else indices.delete(index); phraseDisplayDraft[persona].selectedIndices = [...indices].sort((a, b) => a - b); markDraftChanged(); });
      label.append(caption, check); candidates.append(label);
    }
  };
  element('phrase-count').addEventListener('input', () => { phraseDisplayDraft[persona].count = Number(element<HTMLInputElement>('phrase-count').value); });
  element('phrase-mode').addEventListener('change', () => { phraseDisplayDraft[persona].mode = element<HTMLSelectElement>('phrase-mode').value as 'random' | 'sequential'; markDraftChanged(); });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-persona]')) button.addEventListener('click', () => { capturePhrases(); persona = button.dataset.persona as PetPersona; phraseInput.value = phraseDraft[persona].join('\n'); previewPhrases(); });
  phraseInput.addEventListener('input', () => { capturePhrases(); previewPhrases(); });
  const form = element<HTMLFormElement>('settings-form');
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const notify = (message: string, error = false) => { const el = element('operation-status'); el.textContent = message; el.classList.toggle('error', error); };
  const bubbleEditor = mountBubbleEditor(element('bubble-editor'), api, initial, () => markDraftChanged(), notify, next => update(next));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-edit-completion], [data-edit-sound]')) button.addEventListener('click', () => {
    bubbleEditor.select(`completion-${button.dataset.editCompletion ?? button.dataset.editSound}` as import('../shared/types').BubbleScenario, button.dataset.editSound ? soundPersona : undefined);
    router.navigate('studio', 'bubbles', element(button.dataset.editSound ? 'bubble-sound-enabled' : 'bubble-scenario'));
  });
  let directoryDraft = initial.settings.codexCompletionDirectory;
  let dshDirectoryDraft = initial.settings.deepseekCompletionDirectory;
  const renderCompletionDraft = () => {
    element<HTMLInputElement>('completion-directory').value = directoryDraft ?? '默认 Codex 目录';
    element<HTMLInputElement>('dsh-directory').value = dshDirectoryDraft ?? '默认 DSH 会话目录';
  };
  element('dsh-default-directory').addEventListener('click', () => { dshDirectoryDraft = null; renderCompletionDraft(); markDraftChanged(); });
  element('dsh-choose-directory').addEventListener('click', () => {
    const button = element<HTMLButtonElement>('dsh-choose-directory'); button.disabled = true;
    void api.chooseDeepseekCompletionDirectory().then(directory => { if (!disposed && directory !== null) { dshDirectoryDraft = directory; renderCompletionDraft(); markDraftChanged(); } }).catch(error => { if (!disposed) notify(error instanceof Error ? error.message : '无法选择 DSH 目录。', true); }).finally(() => { if (!disposed) button.disabled = false; });
  });
  element('completion-default-directory').addEventListener('click', () => { directoryDraft = null; renderCompletionDraft(); markDraftChanged(); });
  element('completion-choose-directory').addEventListener('click', () => {
    const button = element<HTMLButtonElement>('completion-choose-directory'); button.disabled = true;
    void api.chooseCodexCompletionDirectory().then(directory => { if (!disposed && directory !== null) { directoryDraft = directory; renderCompletionDraft(); markDraftChanged(); } }).catch(error => { if (!disposed) notify(error instanceof Error ? error.message : '无法选择目录，请重试。', true); }).finally(() => { if (!disposed) button.disabled = false; });
  });
  const soundSlots: SoundSlot[] = ['press', 'release'];
  const renderSounds = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound-persona]')) button.setAttribute('aria-pressed', String(button.dataset.soundPersona === soundPersona));
    for (const slot of soundSlots) {
      const metadata = state.sounds[soundPersona][slot];
      element(`sound-name-${slot}`).textContent = metadata.name;
      element(`sound-kind-${slot}`).textContent = metadata.isCustom ? '自定义' : '内置';
      element(`sound-warning-${slot}`).textContent = metadata.warning ?? soundWarnings.get(warningKey(slot)) ?? '';
      element<HTMLButtonElement>(`sound-reset-${slot}`).disabled = !metadata.isCustom;
      element<HTMLButtonElement>(`sound-choose-${slot}`).disabled = demo;
    }
    preview.sync(soundPersona, state.sounds);
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound-persona]')) button.addEventListener('click', () => { preview.stop(); soundPersona = button.dataset.soundPersona as PetPersona; renderSounds(); });
  for (const slot of soundSlots) {
    element(`sound-preview-${slot}`).addEventListener('click', () => {
      preview.stop(); const volume = Number(input('volume').value);
      if (volume <= 0) { element(`sound-warning-${slot}`).textContent = '当前音量为零，请调高音量后试听。'; return; }
      element(`sound-warning-${slot}`).textContent = state.sounds[soundPersona][slot].warning ?? soundWarnings.get(warningKey(slot)) ?? '';
      void preview.play(slot, volume);
    });
    element(`sound-stop-${slot}`).addEventListener('click', () => preview.stop());
    for (const action of ['choose', 'reset'] as const) element(`sound-${action}-${slot}`).addEventListener('click', () => {
      preview.stop(); const selectedPersona = soundPersona;
      const previous = state.sounds[selectedPersona][slot].revision;
      const button = element<HTMLButtonElement>(`sound-${action}-${slot}`); button.disabled = true;
      void (action === 'choose' ? api.chooseSound(selectedPersona, slot) : api.resetSound(selectedPersona, slot)).then(next => {
        if (disposed) return; update(next);
        notify(next.sounds[selectedPersona][slot].revision === previous ? '音效设置未更改。' : action === 'choose' ? '音效已更换，立即生效。' : '已恢复内置音效，立即生效。');
      }).catch(error => { if (!disposed) notify(error instanceof Error ? error.message : '音效操作失败，请重试。', true); }).finally(() => { if (!disposed) renderSounds(); });
    });
  }
  let uninstallAvailable = false;
  void api.getUninstallInfo().then(info => {
    if (disposed) return;
    element('uninstall-kind').textContent = { installed: '安装版', portable: '免安装版', unsupported: '当前运行方式不支持卸载' }[info.kind];
    element('uninstall-program').textContent = info.programPath ?? '未提供';
    element('uninstall-data').textContent = info.dataPath;
    element('uninstall-reason').textContent = demo ? '本地演示无法卸载程序。' : info.reason ?? '';
    uninstallAvailable = info.available && !demo;
    element<HTMLButtonElement>('uninstall-start').disabled = !uninstallAvailable;
    element('uninstall-start').textContent = info.kind === 'portable' ? '移除免安装程序' : '卸载 DesktopPet';
  }).catch(() => { if (!disposed) element('uninstall-reason').textContent = '无法读取卸载信息，请重新打开应用。'; });
  element('uninstall-start').addEventListener('click', () => {
    if (!uninstallAvailable) return;
    preview.stop(); const button = element<HTMLButtonElement>('uninstall-start'); button.disabled = true;
    void api.requestUninstall(element<HTMLInputElement>('uninstall-remove-data').checked).then(result => {
      if (!disposed) notify(result.started ? '卸载已启动，程序即将退出。' : '已取消卸载。');
    }).catch(error => { if (!disposed) notify(error instanceof Error ? error.message : '无法启动卸载，请重试。', true); }).finally(() => { if (!disposed) button.disabled = !uninstallAvailable; });
  });
  let modeDirty = false;
  const fill = (settings: AppSettings) => {
    draftBase = settings;
    modeDirty = false;
    element<HTMLSelectElement>('pet-mode').value = settings.petMode;
    input('autoCheckUpdates').checked = settings.autoCheckUpdates;
    for (const name of ['soundEnabled', 'alwaysOnTop', 'snapToEdges', 'launchAtLogin'] as const) input(name).checked = settings[name];
    input('scale').value = String(settings.scale); input('volume').value = String(settings.volume);
    input('codexCompletionEnabled').checked = settings.codexCompletionEnabled;
    input('chatgptCompletionEnabled').checked = settings.chatgptCompletionEnabled; input('deepseekCompletionEnabled').checked = settings.deepseekCompletionEnabled;
    input('geminiCompletionEnabled').checked = settings.geminiCompletionEnabled;
    input('geminiHookEnabled').checked = settings.geminiHookEnabled;
    input('codexHookEnabled').checked = settings.codexHookEnabled;
    element('codex-attention-draft').hidden = true;
    for (const source of COMPLETION_SOURCES) input(`attention-${source}`).checked = settings.attentionEnabledBySource[source];
    directoryDraft = settings.codexCompletionDirectory; dshDirectoryDraft = settings.deepseekCompletionDirectory; renderCompletionDraft(); bubbleEditor.fill(settings);
    input('lowBalanceThreshold').value = settings.lowBalanceThreshold ?? ''; input('dailyBudget').value = settings.dailyBudget ?? '';
    phraseDraft = structuredClone(settings.phrasesByPersona); phraseDisplayDraft = structuredClone(settings.phraseDisplayByPersona); phraseInput.value = phraseDraft[persona].join('\n'); previewPhrases(); ranges();
  };
  const ranges = () => { element('scale-output').textContent = `${Number(input('scale').value).toFixed(2)}×`; element('volume-output').textContent = `${Math.round(Number(input('volume').value) * 100)}%`; };
  const draftPages = {
    appearance: ['petMode', 'scale'],
    behavior: ['alwaysOnTop', 'snapToEdges', 'launchAtLogin'],
    reminders: ['lowBalanceThreshold', 'dailyBudget'],
    completion: ['codexCompletionEnabled', 'codexCompletionDirectory', 'codexHookEnabled', 'chatgptCompletionEnabled',
      'deepseekCompletionEnabled', 'deepseekCompletionDirectory', 'geminiCompletionEnabled', 'geminiHookEnabled', 'attentionEnabledBySource'],
    companionship: ['phrasesByPersona', 'phraseDisplayByPersona'],
    sound: ['soundEnabled', 'volume'],
    bubbles: ['bubbleProfilesByPersona'],
    version: ['autoCheckUpdates'],
  } satisfies Partial<Record<SettingsPage, (keyof AppSettings)[]>>;
  const readDraft = (): AppSettings => ({
    ...draftBase,
    petMode: element<HTMLSelectElement>('pet-mode').value as AppSettings['petMode'],
    scale: Number(input('scale').value),
    alwaysOnTop: input('alwaysOnTop').checked,
    snapToEdges: input('snapToEdges').checked,
    launchAtLogin: input('launchAtLogin').checked,
    lowBalanceThreshold: input('lowBalanceThreshold').value.trim() || null,
    dailyBudget: input('dailyBudget').value.trim() || null,
    codexCompletionEnabled: input('codexCompletionEnabled').checked,
    codexCompletionDirectory: directoryDraft,
    codexHookEnabled: input('codexHookEnabled').checked,
    chatgptCompletionEnabled: input('chatgptCompletionEnabled').checked,
    deepseekCompletionEnabled: input('deepseekCompletionEnabled').checked,
    deepseekCompletionDirectory: dshDirectoryDraft,
    geminiCompletionEnabled: input('geminiCompletionEnabled').checked,
    geminiHookEnabled: input('geminiHookEnabled').checked,
    attentionEnabledBySource: Object.fromEntries(COMPLETION_SOURCES.map(source => [source, input(`attention-${source}`).checked])) as AppSettings['attentionEnabledBySource'],
    phrasesByPersona: phraseDraft,
    phraseDisplayByPersona: phraseDisplayDraft,
    soundEnabled: input('soundEnabled').checked,
    volume: Number(input('volume').value),
    bubbleProfilesByPersona: bubbleEditor.getProfiles(),
    autoCheckUpdates: input('autoCheckUpdates').checked,
  });
  const changedFields = (draft: AppSettings) => Object.entries(draftPages).flatMap(([page, keys]) =>
    keys.filter(key => !sameDraftValue(draft[key], draftBase[key])).map(key => ({ page: page as SettingsPage, key })),
  );
  const draftHint = (count: number) => count ? `${count} 项未保存` : '设置已同步';
  const renderDraft = (changes = changedFields(readDraft())) => {
    dirty = changes.length > 0;
    modeDirty = changes.some(({ key }) => key === 'petMode');
    router.setDraftPages(new Set(changes.map(({ page }) => page)));
    setSaveHint(draftHint(changes.length));
    element('codex-attention-draft').hidden = input('codexHookEnabled').checked === state.settings.codexHookEnabled
      && input('attention-codex').checked === state.settings.attentionEnabledBySource.codex;
  };
  function markDraftChanged() {
    draftRevision++;
    renderDraft();
  }
  content.addEventListener('input', event => {
    const control = event.target as HTMLInputElement;
    if (control.form !== form || !control.name || control.id === 'phrase-mode' || control.closest('#bubble-editor')) return;
    ranges();
    markDraftChanged();
  });
  const syncPetMode = () => {
    if (modeDirty) return;
    element<HTMLSelectElement>('pet-mode').value = state.settings.petMode;
    draftBase = { ...draftBase, petMode: state.settings.petMode };
  };
  const update = (next: AppState) => {
    if (disposed) return;
    stateRevision++;
    state = next;
    element<HTMLImageElement>('companion-image').src = state.pet.url;
    element('companion-name').textContent = state.pet.name;
    element('companion-name').title = state.pet.name;
    element('companion-mode').textContent = `${state.settings.petMode === 'simple' ? '简洁模式' : '完整模式'} · ${state.activePet === 'deepseek' ? '关注余额与消费' : state.activePet === 'gemini' ? '关注 Gemini 额度' : '关注 Codex 额度'}`;
    element('companion-presence').textContent = state.petVisible ? '正在桌面陪伴' : '桌宠已隐藏';
    element('companion-presence').dataset.visible = String(state.petVisible);
    if (!saving) syncPetMode();
    const u = state.appUpdate;
    const updateLabels = { idle: '尚未检查更新', checking: '正在检查更新…', current: '当前已是最新版本', available: `发现新版本 v${u.latestVersion}`, downloading: `正在下载 ${u.progress.toFixed(1)}%`, ready: `v${u.latestVersion} 已下载，重启后更新`, installing: '正在准备重启更新…', error: '更新暂未完成', unsupported: '当前运行模式不执行更新' };
    element('update-status').textContent = updateLabels[u.status];
    element('update-mode').textContent = `${u.kind === 'portable' ? '免安装版 · 保留原文件名和位置' : u.kind === 'installed' ? '安装版 · 覆盖升级并保留用户数据' : '开发／演示模式'} · 当前版本 v${u.currentVersion}`;
    element('update-checked').textContent = u.checkedAt ? `上次检查：${new Date(u.checkedAt).toLocaleString()}` : '';
    element('update-error').textContent = u.error ?? '';
    element('update-announcement').hidden = !u.latestVersion;
    const releaseDate = u.releaseDate && Number.isFinite(Date.parse(u.releaseDate)) ? new Date(u.releaseDate).toLocaleDateString() : '';
    element('update-notes-version').textContent = u.latestVersion ? `v${u.latestVersion}${releaseDate ? ` · ${releaseDate}` : ''}` : '';
    element('update-notes').textContent = u.releaseNotes.trim() || '本版本未提供更新公告。';
    element<HTMLProgressElement>('update-progress').value = u.progress; element('update-progress').hidden = u.status !== 'downloading';
    element('update-bytes').textContent = formatUpdateDownloadDetail(u);
    element<HTMLButtonElement>('update-check').disabled = ['unsupported', 'checking', 'downloading', 'installing'].includes(u.status);
    element('update-download').hidden = !u.latestVersion || !['available', 'error'].includes(u.status);
    element('update-cancel').hidden = u.status !== 'downloading'; element('update-install').hidden = u.status !== 'ready';
    renderSounds(); bubbleEditor.update(next);
    root.classList.toggle('gpt-theme', state.activePet === 'gpt');
    root.classList.toggle('dragon-theme', state.activePet === 'gpt' && state.gptAppearance === 'dragon');
    root.classList.toggle('gemini-theme', state.activePet === 'gemini');
    for (const id of ['deepseek', 'gpt', 'gemini'] as const) element(`select-${id}`).setAttribute('aria-pressed', String(state.activePet === id));
    element('gemini-appearance-options').hidden = state.activePet !== 'gemini';
    element('choose-pet').hidden = state.activePet === 'gemini';
    for (const id of ['classic', 'sketch'] as const) element('gemini-' + id).setAttribute('aria-pressed', String(state.geminiAppearance === id));
    renderGeminiQuota(element('gemini-quotas'), state.geminiQuota, false, false);
    const geminiChip = geminiStatusChip(state.geminiQuota, demo);
    element('gemini-status-chip').textContent = geminiChip.text;
    element('gemini-status-chip').dataset.status = geminiChip.status;
    element('gemini-status').textContent = geminiStatus(state.geminiQuota, demo);
    element<HTMLButtonElement>('refresh-gemini').disabled = state.geminiQuota.status === 'loading';
    element('gemini-integration-status').textContent = state.geminiIntegration;
    element('gpt-appearance-options').hidden = state.activePet !== 'gpt';
    element('appearance-custom').hidden = !state.hasCustomGpt;
    element('appearance-custom').style.display = state.hasCustomGpt ? '' : 'none';
    for (const id of ['classic', 'dragon', 'custom'] as const) element(`appearance-${id}`).setAttribute('aria-pressed', String(state.gptAppearance === id));
    renderQuota(element('codex-quotas'), state.codex, false, demo);
    element('codex-status').textContent = quotaStatus(state.codex, demo); element('codex-status').dataset.status = state.codex.status;
    element('codex-updated').textContent = `更新于 ${localTime(state.codex.updatedAt)} · 本地时间`;
    const completionLabels = { disabled: '完成提醒已关闭', starting: '正在连接本机会话…', watching: '正在监听新的完成事件', unavailable: '等待 Codex 会话', error: '会话监听异常' };
    element('completion-status').textContent = [completionLabels[state.codexCompletion.status], state.codexCompletion.error].filter(Boolean).join(' · ');
    element('completion-current-directory').textContent = `当前目录：${state.codexCompletion.directory}`;
    const hook = state.codexAttention;
    const hookLabel = !state.settings.attentionEnabledBySource.codex ? 'Codex CLI／VS Code 等待提醒已关闭'
      : !state.settings.codexHookEnabled ? '未接入：等待提醒已开启，请开启 hook 接入并保存设置'
      : ({ disabled: 'hook 接入尚未启动', starting: '已配置，等待实际提问或审批事件：请在 Codex CLI /hooks 审阅并信任；旧会话未响应时保存工作并重新加载 VS Code', watching: '已收到等待回应事件', unavailable: '客户端暂不支持 hook', error: 'Codex hook 接入异常' }[hook.status]);
    element('codex-attention-status').textContent = [hookLabel, state.settings.codexHookEnabled ? hook.error : null, hook.lastAttentionAt ? `最近事件：${localTime(hook.lastAttentionAt)}` : null].filter(Boolean).join(' · ');
    element('codex-attention-directory').textContent = `hook 主目录：${hook.directory || state.codexCompletion.directory || '正在读取…'}`;
    element('codex-attention-draft').hidden = input('codexHookEnabled').checked === state.settings.codexHookEnabled && input('attention-codex').checked === state.settings.attentionEnabledBySource.codex;
    const appAttention = state.chatgptCompletion;
    const appAttentionLabel = !state.settings.attentionEnabledBySource['chatgpt-work'] ? 'ChatGPT App 等待提醒已关闭'
      : ({ disabled: 'ChatGPT App 监听尚未启动', starting: '正在连接 ChatGPT 桌面通知日志…', watching: appAttention.lastAttentionAt ? '已收到等待回应事件' : '日志已连接，等待实际提问或审批事件；请确认已开启提问和权限通知', unavailable: '未找到 ChatGPT 桌面通知日志，请先启动 ChatGPT App', error: 'ChatGPT 桌面通知日志读取异常' }[appAttention.status]);
    element('chatgpt-attention-status').textContent = [appAttentionLabel, appAttention.error, appAttention.lastAttentionAt ? `最近事件：${localTime(appAttention.lastAttentionAt)}` : null].filter(Boolean).join(' · ');
    element('chatgpt-attention-directory').textContent = `通知日志目录：${appAttention.directory || '正在读取…'}`;
    const workLabels = { disabled: 'ChatGPT Work 提醒已关闭', starting: '正在连接 ChatGPT 桌面通知…', watching: '正在监听 ChatGPT 桌面结束通知', unavailable: '未找到 ChatGPT 桌面通知日志，请先启动桌面应用', error: 'ChatGPT 桌面通知监听异常' };
    element('chatgpt-completion-status').textContent = [workLabels[state.chatgptCompletion.status], state.chatgptCompletion.error].filter(Boolean).join(' · ');
    const dshLabels = { disabled: 'DSH 提醒已关闭', starting: '正在连接 DSH 会话…', watching: '正在监听 DSH 新的完成事件', unavailable: '等待 DSH 会话', error: 'DSH 会话监听异常' };
    element('dsh-completion-status').textContent = [dshLabels[state.deepseekCompletion.status], state.deepseekCompletion.error].filter(Boolean).join(' · ');
    element('dsh-current-directory').textContent = `当前目录：${state.deepseekCompletion.directory}`;
    element<HTMLButtonElement>('refresh-codex').disabled = state.codex.status === 'loading';
    if (!dirty && !saving) fill(next.settings);
    const labels = { unconfigured: '尚未连接', loading: '正在更新', ready: '已连接', error: '连接异常' };
    element('network-status').textContent = labels[state.status]; element('network-status').dataset.status = state.status;
    updateMoney(element('total-balance'), state.balance?.total, state.balance?.currency);
    updateMoney(element('today-spent'), state.ledger.today?.spent, state.ledger.today?.currency);
    element('today-date').textContent = state.ledger.today?.date ?? '等待首次观测';
    element('balance-updated').textContent = `更新于 ${localBalanceTime(state.balance?.observedAt)} · ${zoneLabel(new Date(state.balance?.observedAt ?? Date.now()))}`;
    element('service-message').textContent = [state.error, state.warning, state.balance && !state.balance.isAvailable ? '账户余额暂不可用，请检查账户状态。' : null].filter(Boolean).join(' ');
    element('key-state').textContent = state.hasApiKey ? '已保存 API Key。需要更换时，请输入新的 Key。' : '添加 API Key 后，小鲸鱼会定期为你查看余额。';
    element<HTMLButtonElement>('clear-key').disabled = !state.hasApiKey;
    element<HTMLImageElement>('pet-preview-image').src = state.pet.url; element('pet-name').textContent = state.pet.name;
    element<HTMLButtonElement>('refresh').disabled = state.status === 'loading';
    renderPeriod();
    const tbody = element('history-body'); tbody.replaceChildren();
    const days = [...state.ledger.history];
    if (state.ledger.today && !days.some(d => d.date === state.ledger.today!.date && d.segmentId === state.ledger.today!.segmentId)) days.push(state.ledger.today);
    days.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (!days.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 3; cell.className = 'empty-records'; cell.textContent = '还没有观测记录，连接账户后从今天开始。'; row.append(cell); tbody.append(row); }
    for (const day of days) { const row = document.createElement('tr'); for (const text of [`${day.date} · ${day.timeZone ? `${day.timeZone} · 分段始于 ${localBalanceTime(day.startedAt, day.timeZone)}` : '原北京时间 · UTC+08:00'}`, money(day.spent, day.currency), money(day.increased, day.currency)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); } tbody.append(row); }
  };
  const runStateAction = async (action: () => Promise<AppState>) => {
    const revision = stateRevision;
    const result = await action();
    if (revision === stateRevision) update(result);
    return result;
  };
  const run = async (button: HTMLButtonElement, action: () => Promise<AppState>, success: string) => {
    const ticket = ++operationTicket;
    button.disabled = true; notify('正在处理…');
    try {
      const result = await runStateAction(action);
      if (disposed || ticket !== operationTicket) return;
      if (button.id === 'refresh' && result.status !== 'ready') notify(result.error || (result.status === 'unconfigured' ? '尚未连接账户，请先保存 API Key。' : result.status === 'loading' ? '余额仍在更新中，请稍候。' : '余额查询失败，请稍后重试。'), result.status === 'error');
      else if (button.id === 'refresh' && result.balance && !result.balance.isAvailable) notify('账户余额暂不可用，请检查账户状态。', true);
      else if (button.id === 'refresh-gemini' && result.geminiQuota.error) notify(result.geminiQuota.error, true);
      else if ((button.id === 'refresh-codex' || button.id === 'choose-codex') && result.codex.status !== 'ready') notify(result.codex.error || quotaStatus(result.codex, demo), result.codex.status === 'error');
      else notify(success);
    } catch (error) { if (!disposed && ticket === operationTicket) notify(error instanceof Error ? error.message : '操作失败，请重试。', true); }
    finally { button.disabled = button.id === 'clear-key' ? !state.hasApiKey : button.id === 'refresh' ? state.status === 'loading' : button.id === 'refresh-codex' ? state.codex.status === 'loading' : false; }
  };
  const refreshAll = async (button: HTMLButtonElement) => {
    const ticket = ++operationTicket;
    button.disabled = true;
    button.textContent = '正在刷新…';
    const jobs = [
      { name: 'DeepSeek', refresh: () => api.refreshBalance(), ready: (next: AppState) => next.status === 'ready' && !!next.balance?.isAvailable },
      { name: 'Codex', refresh: () => api.refreshCodexQuota(), ready: (next: AppState) => next.codex.status === 'ready' },
      { name: 'Gemini', refresh: () => api.refreshGeminiQuota(), ready: (next: AppState) => next.geminiQuota.status === 'ready' },
    ];
    const pending: string[] = [];
    try {
      for (const job of jobs) {
        if (disposed) return;
        try {
          if (!job.ready(await runStateAction(job.refresh))) pending.push(job.name);
        } catch {
          pending.push(job.name);
        }
      }
      if (!disposed && ticket === operationTicket) notify(pending.length ? `已尝试刷新。未连接或读取失败：${pending.join('、')}。` : '三个账户均已刷新。');
    } finally {
      button.disabled = false;
      button.textContent = '刷新全部';
    }
  };
  const homeView = mountHome(home, {
    navigate: page => router.navigate(settingsCategory(page), page, 'tab'),
    openReminder: source => {
      const details = content.querySelector<HTMLDetailsElement>(`.integration-card[data-source="${source}"] .integration-details`)!;
      details.open = true;
      router.navigate('reminders', 'completion', details.querySelector('summary')!);
    },
    connectDeepSeek: () => router.navigate('account', 'overview', element('api-key')),
    connectCodex: () => {
      const choose = element<HTMLButtonElement>('choose-codex');
      router.navigate('account', 'codex', choose);
      choose.click();
    },
    refresh: button => void refreshAll(button),
    toggleMode: button => {
      const petMode = state.settings.petMode === 'simple' ? 'full' : 'simple';
      void run(button, () => api.updateSettings({ petMode }), '');
    },
    checkUpdates: () => {
      router.navigate('system', 'version', 'tab');
      element<HTMLButtonElement>('update-check').click();
    },
    selectPet: (id, button) => { if (state.activePet !== id) void run(button, () => api.selectPet(id), '角色已切换。'); },
    changeAppearance: button => {
      if (state.activePet === 'gemini') {
        void run(button, () => api.selectGeminiAppearance(state.geminiAppearance === 'classic' ? 'sketch' : 'classic'), 'Gemini 造型已切换。');
      } else if (state.activePet === 'gpt') {
        void run(button, () => api.selectGptAppearance(state.gptAppearance === 'dragon' ? 'classic' : 'dragon'), 'GPT 造型已切换。');
      } else if (demo) router.navigate('pet', 'appearance', 'tab');
      else void run(button, () => api.choosePet(), '角色图片已更新。');
    },
  }, demo);
  for (const id of ['deepseek', 'gpt', 'gemini'] as const) element(`select-${id}`).addEventListener('click', () => void run(element(`select-${id}`), () => api.selectPet(id), `已切换到${id === 'gemini' ? ' Gemini' : id === 'gpt' ? ' GPT 小伙伴' : '小鲸鱼'}。`));
  for (const id of ['classic', 'dragon', 'custom'] as const) element(`appearance-${id}`).addEventListener('click', () => void run(element(`appearance-${id}`), () => api.selectGptAppearance(id), 'GPT 造型已切换，Codex 额度保持共用。'));
  for (const id of ['classic', 'sketch'] as const) element('gemini-' + id).addEventListener('click', () => void run(element('gemini-' + id), () => api.selectGeminiAppearance(id), 'Gemini 造型已切换。'));
  element('refresh-gemini').addEventListener('click', () => void run(element('refresh-gemini'), () => api.refreshGeminiQuota(), 'Gemini 额度已刷新。'));
  element('refresh-codex').addEventListener('click', () => void run(element('refresh-codex'), () => api.refreshCodexQuota(), 'Codex 额度已刷新。'));
  element('choose-codex').addEventListener('click', () => void run(element('choose-codex'), () => api.chooseCodexExecutable(), 'Codex 路径已更新。'));
  element('codex-usage').addEventListener('click', () => { void api.openCodexUsage().catch(() => notify('无法打开使用量页面，请重试。', true)); });
  element('refresh').addEventListener('click', () => void run(element('refresh'), () => api.refreshBalance(), '余额已刷新。'));
  element('choose-pet').addEventListener('click', () => void run(element('choose-pet'), () => api.choosePet(), '角色图片已更新。'));
  element('reset-pet').addEventListener('click', () => void run(element('reset-pet'), () => api.resetPet(), '已恢复当前角色。'));
  element('clear-key').addEventListener('click', () => void run(element('clear-key'), () => api.clearApiKey(), '已移除 API Key。'));
  element('key-form').addEventListener('submit', event => {
    event.preventDefault(); const keyInput = element<HTMLInputElement>('api-key'); const key = keyInput.value.trim();
    if (!key) { notify('请先输入 API Key。', true); keyInput.focus(); return; }
    keyInput.value = ''; void run(element('save-key'), () => api.setApiKey(key), 'API Key 已保存。');
  });
  const updateAction = async (action: () => Promise<unknown>) => {
    try { await action(); } catch (error) { if (!disposed) notify(error instanceof Error ? error.message : '更新暂未完成，请重试。', true); }
  };
  element('update-check').addEventListener('click', () => { void updateAction(() => api.checkForUpdates()); });
  element('update-download').addEventListener('click', () => { void updateAction(() => api.downloadUpdate()); });
  element('update-cancel').addEventListener('click', () => { void updateAction(() => api.cancelUpdateDownload()); });
  element('update-install').addEventListener('click', () => {
    if (saving) return;
    if (dirty) { element('update-dirty-dialog').hidden = false; return; }
    void updateAction(() => api.installUpdate());
  });
  const discardDraft = () => {
    preview.stop();
    bubbleEditor.stopAudio();
    fill(state.settings);
    renderDraft([]);
    element('update-dirty-dialog').hidden = true;
  };
  discardButton.addEventListener('click', () => {
    discardDraft();
    element('save-settings').focus({ preventScroll: true });
  });
  element('update-discard').addEventListener('click', () => {
    if (saving) return;
    discardDraft();
    void updateAction(() => api.installUpdate());
  });
  element('update-keep-editing').addEventListener('click', () => { element('update-dirty-dialog').hidden = true; });
  element('update-save-first').addEventListener('click', () => { element('update-dirty-dialog').hidden = true; form.requestSubmit(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving) return;
    try {
      capturePhrases();
      const draft = readDraft();
      const changes = changedFields(draft);
      if (!changes.length) { setSaveHint('设置已保存'); return; }
      validatePhraseDisplays(draft.phraseDisplayByPersona, draft.phrasesByPersona);
      const submitted = structuredClone(Object.fromEntries(changes.map(({ key }) => [key, draft[key]]))) as Partial<AppSettings>;
      const patch = { ...submitted };
      if ('lowBalanceThreshold' in patch) patch.lowBalanceThreshold = decimalSetting(draft.lowBalanceThreshold ?? '');
      if ('dailyBudget' in patch) patch.dailyBudget = decimalSetting(draft.dailyBudget ?? '');
      if ('phrasesByPersona' in patch) patch.phraseDisplayByPersona = structuredClone(draft.phraseDisplayByPersona);
      const savingRevision = draftRevision;
      saving = true;
      discardButton.disabled = true;
      void run(element('save-settings'), async () => {
        const next = await api.updateSettings(patch);
        if (savingRevision === draftRevision) {
          fill(next.settings);
          renderDraft([]);
        } else {
          draftBase = { ...draftBase, ...submitted };
          renderDraft();
          if (!dirty) fill(next.settings);
        }
        if (!dirty) setSaveHint('设置已保存');
        return next;
      }, '').finally(() => {
        saving = false;
        syncPetMode();
        discardButton.disabled = !dirty;
      });
    } catch (error) { notify(error instanceof Error ? error.message : '请检查输入。', true); }
  });
  const renderPeriod = () => {
    const now = new Date();
    const period = deepseekPeriod(now);
    const heading = `${period.label}${period.note ? ` · ${period.note}` : ''} · ${period.zone}`;
    element('deepseek-period').textContent = heading;
    element('records-zone').textContent = `电脑时区 · ${period.zone}`;
    const explanation = `对应当前北京时间日期的高峰窗口（已换算为电脑时间）：${period.windows}。官方按北京时间周一至周五生效，周末及中国公共假期全天低谷。仅标识当前模型收费时段，不代表历史消费归属。`;
    element('deepseek-period-rule').textContent = explanation;
    element('records-period').textContent = `${heading}。${explanation}`;
    element('balance-updated').textContent = `更新于 ${localBalanceTime(state.balance?.observedAt)} · ${zoneLabel(new Date(state.balance?.observedAt ?? Date.now()))}`;
    if (!home.hidden) {
      const drafts = new Set<CompletionSource>();
      const saved = state.settings;
      if (directoryDraft !== saved.codexCompletionDirectory || input('codexHookEnabled').checked !== saved.codexHookEnabled) drafts.add('codex');
      if (dshDirectoryDraft !== saved.deepseekCompletionDirectory) drafts.add('deepseek-harness');
      if (input('geminiHookEnabled').checked !== saved.geminiHookEnabled) drafts.add('antigravity');
      for (const source of COMPLETION_SOURCES) {
        if (input(`attention-${source}`).checked !== saved.attentionEnabledBySource[source]) drafts.add(source);
      }
      homeView.update(state, drafts, period, now);
    }
  };
  const refreshTime = () => { if (!disposed) renderPeriod(); };
  document.addEventListener('visibilitychange', refreshTime); window.addEventListener('focus', refreshTime);
  const periodTimer = setInterval(refreshTime, 60000);
  update(initial);
  const openVersion = () => router.navigate('system', 'version', 'tab');
  if (new URLSearchParams(location.search).get('page') === 'version') openVersion();
  else router.navigate('home');
  const stopSettingsPage = api.onSettingsPage(openVersion);
  const geminiTimer = setInterval(() => { if (!element('gemini').hidden && state.activePet !== 'gemini') void api.refreshGeminiQuota().catch(() => {}); }, 60000);
  const countdown = setInterval(() => { renderQuota(element('codex-quotas'), state.codex, false, demo); element('codex-status').textContent = quotaStatus(state.codex, demo); renderGeminiQuota(element('gemini-quotas'), state.geminiQuota, false, false); }, 30000);
  return { update, dispose: () => { disposed = true; clearInterval(periodTimer); document.removeEventListener('visibilitychange', refreshTime); window.removeEventListener('focus', refreshTime); stopSettingsPage(); preview.dispose(); bubbleEditor.dispose(); clearInterval(geminiTimer); clearInterval(countdown); } };
}
