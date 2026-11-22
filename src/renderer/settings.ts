import { deepseekPeriod, localBalanceTime, zoneLabel } from '../shared/deepseek-time';
import { mountBubbleEditor } from './bubble-editor';
import './settings.css';
import './settings-workspace.css';
import type { AppSettings, AppState, DesktopApi, PetPersona, SoundSlot, CompletionSource } from '../shared/types';
import { validatePhraseDisplays } from '../shared/phrases';
import { decimalSetting, updateMoney } from './format';
import { localTime, quotaStatus, renderQuota } from './quota';
import { geminiStatus, geminiStatusChip, renderGeminiQuota } from './gemini-quota';
import { COMPLETION_SOURCES, SOUND_SLOTS, petPersona } from '../shared/bubble-settings';
import { normalizePetNicknames, petNickname } from '../shared/pet-nicknames';
import { APP_VERSION, GEMINI_PETS, GPT_DRAGON_PET, GPT_PET } from '../shared/defaults';
import { PersonaSoundPlayer } from './sounds';
import { mountSettingsRouter, settingsCategory, type SettingsPage } from './settings/router';
import { mountHome } from './settings/views/home';
import { mountReminders } from './settings/views/reminders';
import { arrangePhrases, mountStudio, soundCards } from './settings/views/studio';
import { mountPartners } from './settings/views/pet';
import { mountAccounts } from './settings/views/account';
import { mountSystem } from './settings/views/system';
import './ui/components.css';
import './settings/views/studio.css';

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
  let persona = petPersona(initial);
  const soundWarnings = new Map<string, string>();
  const warningKey = (slot: SoundSlot) => `${persona}:${slot}:${state.sounds[persona][slot].revision}`;
  const preview = new PersonaSoundPlayer(api, (slot, text) => {
    if (disposed) return;
    soundWarnings.set(warningKey(slot), text);
    element(`sound-warning-${slot}`).textContent = text;
  }, undefined, SOUND_SLOTS);
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
          <section id="reminders" class="section"><div class="reminder-balance"><div class="section-heading"><h2>余额提醒</h2></div><div class="panel reminder-grid"><div><label class="field-label" for="low-balance">余额低于</label><input id="low-balance" name="lowBalanceThreshold" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">以账户币种计算，留空关闭低余额提醒。</p></div><div><label class="field-label" for="daily-budget">今日观测消费达到</label><input id="daily-budget" name="dailyBudget" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">按电脑当前时区分段、每日统计，留空关闭预算提醒。</p></div></div></div></section>
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
  const sound = makePage('sound', '音效', '');
  makePage('bubbles', '气泡与提示', '<div id="bubble-editor"></div>');
  const completion = document.createElement('section');
  completion.id = 'completion';
  completion.className = 'section';
  content.append(completion);
  const phrases = makePage('companionship', '陪伴短句', '<div class="phrase-preview"><img id="phrase-preview-image" alt=""><p id="phrase-preview-text"></p></div><label class="field-label" for="phrases">编辑短句 <span>每行一句</span></label>');
  phrases.querySelector('.panel')!.append(element<HTMLTextAreaElement>('phrases'));
  phrases.querySelector('.panel')!.insertAdjacentHTML('beforeend', '<div class="phrase-display-controls"><label class="field-label" for="phrase-count">每轮展示数量 N</label><input id="phrase-count" name="phraseCount" form="settings-form" type="number" min="0" max="20" step="1"><label class="field-label" for="phrase-mode">展示模式</label><select id="phrase-mode" name="phraseMode" form="settings-form"><option value="sequential">按顺序切换</option><option value="random">随机展示</option></select><p class="hint">0 表示关闭短句页。勾选至少 N 条候选；每轮每页展示一句。顺序模式接着上轮看过的位置继续。</p><div id="phrase-candidates" role="group" aria-label="候选短句"></div></div>');
  element('appearance').querySelector('label[for="phrases"]')!.remove();
  arrangePhrases(phrases);
  const reminderView = mountReminders(completion, element('reminders'), api, initial,
    (persona, source) => bubbleEditor.getCompletionVolume(persona, source));
  const toggles = element('appearance').querySelector('.toggle-grid')!;
  for (const name of ['alwaysOnTop', 'snapToEdges', 'launchAtLogin']) behavior.querySelector('.panel')!.append(root.querySelector(`input[name="${name}"]`)!.closest('label')!);
  sound.querySelector('.panel')!.append(root.querySelector('input[name="soundEnabled"]')!.closest('label')!);
  sound.querySelector('.panel')!.append(element('volume').closest('.setting-row')!); toggles.remove();
  sound.querySelector('.panel')!.insertAdjacentHTML('beforeend', soundCards());
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
  const partners = mountPartners(element('appearance'), behavior);
  const accounts = mountAccounts(element('overview'), element('codex'), geminiSection, element('records'));
  const system = mountSystem(element('version'), element('uninstall'));
  main.append(content, saveBar);
  element<HTMLButtonElement>('save-settings').setAttribute('form', 'settings-form');
  for (const id of ['update-download', 'update-install', 'update-save-first']) element(id).classList.add('primary-button');
  for (const control of content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name], textarea[name]')) control.setAttribute('form', 'settings-form');
  settingsForm.hidden = true;
  root.querySelector('.page-footer')!.remove();
  const router = mountSettingsRouter(root, content, initial.activePet === 'gemini' ? 'gemini' : initial.activePet === 'gpt' ? 'codex' : 'overview', page => {
    studio.showPage(page);
    reminderView.showBalance(page === 'completion');
    reminderView.stopAudio();
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
  phraseInput.addEventListener('input', () => { capturePhrases(); previewPhrases(); });
  const form = element<HTMLFormElement>('settings-form');
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const notify = (message: string, error = false) => { const el = element('operation-status'); el.textContent = message; el.classList.toggle('error', error); };
  const bubbleEditor = mountBubbleEditor(element('bubble-editor'), api, initial, () => markDraftChanged(), notify, next => update(next));
  const studio = mountStudio(main, initial, next => {
    capturePhrases();
    persona = next;
    phraseInput.value = phraseDraft[persona].join('\n');
    previewPhrases();
    bubbleEditor.setPersona(next);
    preview.stop();
    renderSounds();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-edit-completion], [data-edit-sound]')) button.addEventListener('click', () => {
    const source = (button.dataset.editCompletion ?? button.dataset.editSound) as CompletionSource;
    if (button.dataset.editCompletion) studio.select(petPersona(state));
    bubbleEditor.select(`completion-${source}`);
    router.navigate('studio', 'bubbles', element('bubble-sound-enabled'));
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
  const renderSounds = () => {
    for (const slot of SOUND_SLOTS) {
      const metadata = state.sounds[persona][slot];
      element(`sound-name-${slot}`).textContent = metadata.name;
      element(`sound-kind-${slot}`).textContent = metadata.isCustom ? '自定义' : '内置';
      element(`sound-warning-${slot}`).textContent = metadata.warning ?? soundWarnings.get(warningKey(slot)) ?? '';
      element<HTMLButtonElement>(`sound-reset-${slot}`).disabled = !metadata.isCustom;
      element<HTMLButtonElement>(`sound-choose-${slot}`).disabled = demo;
    }
    preview.sync(persona, state.sounds);
  };
  for (const slot of SOUND_SLOTS) {
    element(`sound-preview-${slot}`).addEventListener('click', () => {
      preview.stop();
      const volume = slot === 'press' || slot === 'release'
        ? Number(input('volume').value)
        : bubbleEditor.getCompletionVolume(persona, slot.slice('completion-'.length) as CompletionSource);
      if (volume <= 0) { element(`sound-warning-${slot}`).textContent = '当前音量为零，请调高音量后试听。'; return; }
      element(`sound-warning-${slot}`).textContent = state.sounds[persona][slot].warning ?? soundWarnings.get(warningKey(slot)) ?? '';
      void preview.play(slot, volume);
    });
    element(`sound-stop-${slot}`).addEventListener('click', () => preview.stop());
    for (const action of ['choose', 'reset'] as const) element(`sound-${action}-${slot}`).addEventListener('click', () => {
      preview.stop(); const selectedPersona = persona;
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
    partners.fill(settings);
    input('autoCheckUpdates').checked = settings.autoCheckUpdates;
    for (const name of ['soundEnabled', 'alwaysOnTop', 'snapToEdges', 'launchAtLogin'] as const) input(name).checked = settings[name];
    input('scale').value = String(settings.scale); input('volume').value = String(settings.volume);
    input('codexCompletionEnabled').checked = settings.codexCompletionEnabled;
    input('chatgptCompletionEnabled').checked = settings.chatgptCompletionEnabled; input('deepseekCompletionEnabled').checked = settings.deepseekCompletionEnabled;
    input('geminiCompletionEnabled').checked = settings.geminiCompletionEnabled;
    input('geminiHookEnabled').checked = settings.geminiHookEnabled;
    input('codexHookEnabled').checked = settings.codexHookEnabled;
    for (const source of COMPLETION_SOURCES) input(`attention-${source}`).checked = settings.attentionEnabledBySource[source];
    directoryDraft = settings.codexCompletionDirectory; dshDirectoryDraft = settings.deepseekCompletionDirectory; renderCompletionDraft(); bubbleEditor.fill(settings);
    input('lowBalanceThreshold').value = settings.lowBalanceThreshold ?? ''; input('dailyBudget').value = settings.dailyBudget ?? '';
    phraseDraft = structuredClone(settings.phrasesByPersona); phraseDisplayDraft = structuredClone(settings.phraseDisplayByPersona); phraseInput.value = phraseDraft[persona].join('\n'); previewPhrases(); ranges();
  };
  const ranges = () => { element('scale-output').textContent = `${Number(input('scale').value).toFixed(2)}×`; element('volume-output').textContent = `${Math.round(Number(input('volume').value) * 100)}%`; };
  const draftPages = {
    appearance: ['petMode', 'petNicknames'],
    behavior: ['scale', 'alwaysOnTop', 'snapToEdges', 'launchAtLogin'],
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
    petNicknames: partners.readNicknames(),
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
  const reminderDrafts = () => {
    const drafts = new Set<CompletionSource>();
    const saved = state.settings;
    if (directoryDraft !== saved.codexCompletionDirectory || input('codexHookEnabled').checked !== saved.codexHookEnabled) drafts.add('codex');
    if (dshDirectoryDraft !== saved.deepseekCompletionDirectory) drafts.add('deepseek-harness');
    if (input('geminiHookEnabled').checked !== saved.geminiHookEnabled) drafts.add('antigravity');
    for (const source of COMPLETION_SOURCES) {
      if (input(`attention-${source}`).checked !== saved.attentionEnabledBySource[source]) drafts.add(source);
    }
    return drafts;
  };
  const updateReminders = () => reminderView.update(state, reminderDrafts());
  const renderDraft = (changes = changedFields(readDraft())) => {
    dirty = changes.length > 0;
    modeDirty = changes.some(({ key }) => key === 'petMode');
    router.setDraftPages(new Set(changes.map(({ page }) => page)));
    setSaveHint(draftHint(changes.length));
    updateReminders();
    if (!home.hidden) renderPeriod();
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
    partners.setMode(state.settings.petMode);
    draftBase = { ...draftBase, petMode: state.settings.petMode };
  };
  const update = (next: AppState) => {
    if (disposed) return;
    stateRevision++;
    state = next;
    const nickname = petNickname(state);
    element<HTMLImageElement>('companion-image').src = state.pet.url;
    element('companion-name').textContent = nickname;
    element('companion-name').title = nickname;
    element('companion-mode').textContent = `${state.settings.petMode === 'simple' ? '简洁模式' : '完整模式'} · ${state.activePet === 'deepseek' ? '关注余额与消费' : state.activePet === 'gemini' ? '关注 Gemini 额度' : '关注 Codex 额度'}`;
    element('companion-presence').textContent = state.petVisible ? '正在桌面陪伴' : '桌宠已隐藏';
    element('companion-presence').dataset.visible = String(state.petVisible);
    if (!saving) syncPetMode();
    system.update(state.appUpdate);
    studio.update(state);
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
    element('gpt-appearance-options').hidden = state.activePet !== 'gpt';
    element('appearance-custom').hidden = !state.hasCustomGpt;
    element('appearance-custom').style.display = state.hasCustomGpt ? '' : 'none';
    for (const id of ['classic', 'dragon', 'custom'] as const) element(`appearance-${id}`).setAttribute('aria-pressed', String(state.gptAppearance === id));
    renderQuota(element('codex-quotas'), state.codex, false, demo);
    element('codex-status').textContent = quotaStatus(state.codex, demo); element('codex-status').dataset.status = state.codex.status;
    element('codex-updated').textContent = `更新于 ${localTime(state.codex.updatedAt)} · 本地时间`;
    element<HTMLButtonElement>('refresh-codex').disabled = state.codex.status === 'loading';
    if (!dirty && !saving) fill(next.settings);
    updateReminders();
    const labels = { unconfigured: '尚未连接', loading: '正在更新', ready: '已连接', error: '连接异常' };
    element('network-status').textContent = labels[state.status]; element('network-status').dataset.status = state.status;
    updateMoney(element('total-balance'), state.balance?.total, state.balance?.currency);
    updateMoney(element('today-spent'), state.ledger.today?.spent, state.ledger.today?.currency);
    element('today-date').textContent = state.ledger.today?.date ?? '等待首次观测';
    element('balance-updated').textContent = `更新于 ${localBalanceTime(state.balance?.observedAt)} · ${zoneLabel(new Date(state.balance?.observedAt ?? Date.now()))}`;
    element('service-message').textContent = [state.error, state.warning, state.balance && !state.balance.isAvailable ? '账户余额暂不可用，请检查账户状态。' : null].filter(Boolean).join(' ');
    element('key-state').textContent = state.hasApiKey ? '已保存 API Key。需要更换时，请输入新的 Key。' : '添加 API Key 后，小鲸鱼会定期为你查看余额。';
    element<HTMLButtonElement>('clear-key').disabled = !state.hasApiKey;
    element<HTMLImageElement>('pet-preview-image').src = state.pet.url; element('pet-name').textContent = nickname;
    element<HTMLButtonElement>('refresh').disabled = state.status === 'loading';
    renderPeriod();
    accounts.update(state.ledger);
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
    openReminder: source => router.navigate('reminders', 'completion', reminderView.openGuide(source)),
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
      if ('petNicknames' in patch) patch.petNicknames = normalizePetNicknames(patch.petNicknames);
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
    if (!home.hidden) homeView.update(state, reminderDrafts(), period, now);
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
  return { update, dispose: () => { disposed = true; clearInterval(periodTimer); document.removeEventListener('visibilitychange', refreshTime); window.removeEventListener('focus', refreshTime); stopSettingsPage(); preview.dispose(); bubbleEditor.dispose(); reminderView.dispose(); clearInterval(geminiTimer); clearInterval(countdown); } };
}
