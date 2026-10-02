import type { AppSettings, AppState, DesktopApi } from '../shared/types';
import { beijingTime, decimalSetting, money, updateMoney } from './format';
import { localTime, quotaStatus, renderQuota } from './quota';

export function mountSettings(root: HTMLElement, api: DesktopApi, initial: AppState, demo: boolean) {
  let state = initial;
  let dirty = false;
  root.innerHTML = `
    <div class="settings-shell">
      <aside class="sidebar"><a class="brand" href="#overview"><span class="brand-mark">≈</span><span>DesktopPlay<small>让桌面多一点陪伴</small></span></a>
        <nav aria-label="设置分区"><a href="#overview">◉ <span>余额概览</span></a><a href="#codex">◈ <span>Codex 额度</span></a><a href="#appearance">◌ <span>外观与陪伴</span></a><a href="#reminders">◇ <span>余额提醒</span></a><a href="#records">≡ <span>观测记录</span></a></nav>
        <div class="sidebar-footer">两个小伙伴 · v0.2<small>每一份专注，都值得被陪伴。</small></div>
      </aside>
      <main class="settings-main">
        <header><div class="eyebrow">YOUR LITTLE DESKTOP COMPANION</div><h1>桌宠的栖息地<span>✦</span></h1><p>看看余额与额度，调整心情，继续今天的小冒险。</p></header>
        ${demo ? '<div class="demo-banner" role="status">本地演示模式 · 以下余额与 Codex 额度为布局示例，不连接真实账户。</div>' : ''}
        <div id="operation-status" class="operation-status" role="status" aria-live="polite"></div>
        <section id="overview" class="section"><div class="section-heading"><h2>余额概览</h2><span id="network-status" class="status-chip"></span></div>
          <div class="balance-grid"><article class="balance-card"><div class="card-label">当前账户余额</div><div id="total-balance" class="big-money">—</div><div class="balance-bottom"><span id="balance-updated">尚未更新</span><button id="refresh" class="light-button" type="button">↻ 刷新余额</button></div></article>
          <article class="today-card"><div class="card-label">今日已观测消费</div><div id="today-spent" class="today-money">—</div><span id="today-date"></span><p>一点一滴，记录今天的投入。</p></article></div>
          <div id="service-message" class="service-message" role="status"></div>
          <div class="panel key-panel"><div><h3>连接 DeepSeek 账户</h3><p id="key-state">添加 API Key 后，小鲸鱼会定期为你查看余额。</p></div><form id="key-form"><label class="sr-only" for="api-key">DeepSeek API Key</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="输入新的 API Key" maxlength="512"><button id="save-key" type="submit" class="primary-button">保存 Key</button><button id="clear-key" type="button" class="text-button">移除</button></form><p class="hint">已保存的 Key 不会回显；余额查询直接由桌面应用发起。</p></div>
        </section>
        <section id="codex" class="section codex-section"><div class="section-heading"><h2>Codex 编程额度</h2><span id="codex-status" class="status-chip"></span></div><div class="panel"><div id="codex-quotas" class="quota-cards"></div><div class="codex-actions"><span id="codex-updated" class="hint"></span><div class="button-row"><button id="refresh-codex" type="button" class="secondary-button">↻ 刷新额度</button><button id="choose-codex" type="button" class="text-button">选择 codex.exe</button><button id="codex-usage" type="button" class="text-button">查看使用量 ↗</button></div></div><p class="hint">读取本机已登录的 Codex；未连接时请安装并登录 Codex，也可选择 codex.exe。</p></div></section>
        <form id="settings-form">
          <section id="appearance" class="section"><div class="section-heading"><h2>外观与陪伴</h2><span class="section-note">按你喜欢的方式待着</span></div>
            <div class="panel"><div class="pet-selector" role="group" aria-label="切换内置桌宠"><button id="select-deepseek" type="button" class="pet-option" aria-pressed="false"><img src="./assets/whale.png" alt=""><span>DeepSeek 小鲸鱼<small>账户余额与消费</small></span></button><button id="select-gpt" type="button" class="pet-option" aria-pressed="false"><img src="./assets/gpt.png" alt=""><span>GPT 小伙伴<small>Codex 额度与重置时间</small></span></button></div><div class="pet-preview-row"><div class="pet-preview"><img id="pet-preview-image" alt="当前桌宠角色"></div><div><h3 id="pet-name"></h3><p>点击桌宠查看余额或 Codex 额度，拖动它换个位置。<br>右键打开快捷菜单。</p><div class="button-row"><button id="choose-pet" type="button" class="secondary-button">换一张图片</button><button id="reset-pet" type="button" class="text-button">恢复当前角色</button></div></div></div>
            <div class="setting-row"><label for="scale">角色大小<small>屏幕空间不足时自动缩小，保留所选比例</small></label><div class="range-control"><input id="scale" name="scale" type="range" min="0.5" max="2" step="0.05"><output id="scale-output" for="scale"></output></div></div>
            <div class="setting-row"><label for="volume">音效音量<small>按下与松开时的一点小声音</small></label><div class="range-control"><input id="volume" name="volume" type="range" min="0" max="1" step="0.05"><output id="volume-output" for="volume"></output></div></div>
            <div class="toggle-grid"><label class="toggle-label"><span>启用点击音效</span><input name="soundEnabled" type="checkbox"></label><label class="toggle-label"><span>始终置于顶层</span><input name="alwaysOnTop" type="checkbox"></label><label class="toggle-label"><span>贴近边缘时自动吸附</span><input name="snapToEdges" type="checkbox"></label><label class="toggle-label"><span>开机自动启动</span><input name="launchAtLogin" type="checkbox"></label></div>
            <label class="field-label" for="phrases">陪伴短句 <span>每行一句</span></label><textarea id="phrases" name="phrases" rows="3" maxlength="4000" placeholder="今天也要照顾好自己呀。"></textarea></div>
          </section>
          <section id="reminders" class="section"><div class="section-heading"><h2>余额提醒</h2><span class="section-note">轻轻提醒，安心工作</span></div><div class="panel reminder-grid"><div><label class="field-label" for="low-balance">余额低于</label><input id="low-balance" name="lowBalanceThreshold" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">以账户币种计算，留空关闭低余额提醒。</p></div><div><label class="field-label" for="daily-budget">今日观测消费达到</label><input id="daily-budget" name="dailyBudget" type="text" inputmode="decimal" placeholder="不填写则关闭"><p class="hint">按北京时间每日统计，留空关闭预算提醒。</p></div></div></section>
          <div class="save-bar"><span id="save-hint">把喜欢的设置，留给下次见面。</span><button id="save-settings" type="submit" class="primary-button">保存设置</button></div>
        </form>
        <section id="records" class="section"><div class="section-heading"><h2>观测记录</h2><span class="section-note">北京时间 · UTC+8</span></div><div class="panel"><div class="table-scroll"><table><caption class="sr-only">每日已观测消费及余额增加</caption><thead><tr><th scope="col">日期</th><th scope="col">已观测消费</th><th scope="col">余额增加</th></tr></thead><tbody id="history-body"></tbody></table></div><div class="statistics-note"><strong>这些数字代表什么？</strong><p>消费是两次余额观测之间的下降量，不是逐次调用账单。应用关闭或断网期间的变化只能在下一次观测时发现；同时发生的充值与消费可能相互抵消。每日首次成功观测建立起点，跨午夜差额不计入新一天；仅当日相邻观测下降累计。</p><p>DesktopPlay 不提供 AI 聊天，也不估算每轮对话费用。金额展示保留 2 位小数，内部记录保留 8 位。</p></div></div></section>
        <footer class="page-footer">让每一天，都有一个小伙伴陪着。 ✦</footer>
      </main>
    </div>`;
  const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const form = element<HTMLFormElement>('settings-form');
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const notify = (message: string, error = false) => { const el = element('operation-status'); el.textContent = message; el.classList.toggle('error', error); };
  const fill = (settings: AppSettings) => {
    for (const name of ['soundEnabled', 'alwaysOnTop', 'snapToEdges', 'launchAtLogin'] as const) input(name).checked = settings[name];
    input('scale').value = String(settings.scale); input('volume').value = String(settings.volume);
    input('lowBalanceThreshold').value = settings.lowBalanceThreshold ?? ''; input('dailyBudget').value = settings.dailyBudget ?? '';
    (form.elements.namedItem('phrases') as HTMLTextAreaElement).value = settings.phrases.join('\n'); ranges();
  };
  const ranges = () => { element('scale-output').textContent = `${Number(input('scale').value).toFixed(2)}×`; element('volume-output').textContent = `${Math.round(Number(input('volume').value) * 100)}%`; };
  form.addEventListener('input', () => { dirty = true; ranges(); element('save-hint').textContent = '有尚未保存的调整'; });
  const update = (next: AppState) => {
    state = next;
    root.classList.toggle('gpt-theme', state.activePet === 'gpt');
    for (const id of ['deepseek', 'gpt'] as const) element(`select-${id}`).setAttribute('aria-pressed', String(state.activePet === id));
    renderQuota(element('codex-quotas'), state.codex, false, demo);
    element('codex-status').textContent = quotaStatus(state.codex, demo); element('codex-status').dataset.status = state.codex.status;
    element('codex-updated').textContent = `更新于 ${localTime(state.codex.updatedAt)} · 本地时间`;
    element<HTMLButtonElement>('refresh-codex').disabled = state.codex.status === 'loading';
    if (!dirty) fill(next.settings);
    const labels = { unconfigured: '尚未连接', loading: '正在更新', ready: '已连接', error: '连接异常' };
    element('network-status').textContent = labels[state.status]; element('network-status').dataset.status = state.status;
    updateMoney(element('total-balance'), state.balance?.total, state.balance?.currency);
    updateMoney(element('today-spent'), state.ledger.today?.spent, state.ledger.today?.currency);
    element('today-date').textContent = state.ledger.today?.date ?? '等待首次观测';
    element('balance-updated').textContent = `更新于 ${beijingTime(state.balance?.observedAt)} · 北京时间`;
    element('service-message').textContent = [state.error, state.warning, state.balance && !state.balance.isAvailable ? '账户余额暂不可用，请检查账户状态。' : null].filter(Boolean).join(' ');
    element('key-state').textContent = state.hasApiKey ? '已保存 API Key。需要更换时，请输入新的 Key。' : '添加 API Key 后，小鲸鱼会定期为你查看余额。';
    element<HTMLButtonElement>('clear-key').disabled = !state.hasApiKey;
    element<HTMLImageElement>('pet-preview-image').src = state.pet.url; element('pet-name').textContent = state.pet.name;
    element<HTMLButtonElement>('refresh').disabled = state.status === 'loading';
    const tbody = element('history-body'); tbody.replaceChildren();
    const days = [...(state.ledger.today ? [state.ledger.today] : []), ...state.ledger.history.filter(day => day.date !== state.ledger.today?.date)].sort((a, b) => b.date.localeCompare(a.date));
    if (!days.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 3; cell.className = 'empty-records'; cell.textContent = '还没有观测记录，连接账户后从今天开始。'; row.append(cell); tbody.append(row); }
    for (const day of days) { const row = document.createElement('tr'); for (const text of [day.date, money(day.spent, day.currency), money(day.increased, day.currency)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); } tbody.append(row); }
  };
  const run = async (button: HTMLButtonElement, action: () => Promise<AppState>, success: string) => {
    button.disabled = true; notify('正在处理…');
    try {
      const result = await action(); update(result);
      if (button.id === 'refresh' && result.status !== 'ready') notify(result.error || (result.status === 'unconfigured' ? '尚未连接账户，请先保存 API Key。' : result.status === 'loading' ? '余额仍在更新中，请稍候。' : '余额查询失败，请稍后重试。'), result.status === 'error');
      else if (button.id === 'refresh' && result.balance && !result.balance.isAvailable) notify('账户余额暂不可用，请检查账户状态。', true);
      else if ((button.id === 'refresh-codex' || button.id === 'choose-codex') && result.codex.status !== 'ready') notify(result.codex.error || quotaStatus(result.codex, demo), result.codex.status === 'error');
      else notify(success);
    } catch (error) { notify(error instanceof Error ? error.message : '操作失败，请重试。', true); }
    finally { button.disabled = button.id === 'clear-key' ? !state.hasApiKey : button.id === 'refresh' ? state.status === 'loading' : button.id === 'refresh-codex' ? state.codex.status === 'loading' : false; }
  };
  for (const id of ['deepseek', 'gpt'] as const) element(`select-${id}`).addEventListener('click', () => void run(element(`select-${id}`), () => api.selectPet(id), `已切换到${id === 'gpt' ? ' GPT 小伙伴' : '小鲸鱼'}。`));
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
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const patch: AppSettings = { ...state.settings, scale: Math.max(0.5, Math.min(2, Number(input('scale').value))), volume: Math.max(0, Math.min(1, Number(input('volume').value))), lowBalanceThreshold: decimalSetting(input('lowBalanceThreshold').value), dailyBudget: decimalSetting(input('dailyBudget').value), phrases: (form.elements.namedItem('phrases') as HTMLTextAreaElement).value.split('\n').map(line => line.trim()).filter(Boolean), soundEnabled: input('soundEnabled').checked, alwaysOnTop: input('alwaysOnTop').checked, snapToEdges: input('snapToEdges').checked, launchAtLogin: input('launchAtLogin').checked };
      void run(element('save-settings'), async () => { const next = await api.updateSettings(patch); dirty = false; fill(next.settings); element('save-hint').textContent = '设置已保存'; return next; }, '设置已保存，桌宠已经收到啦。');
    } catch (error) { notify(error instanceof Error ? error.message : '请检查输入。', true); }
  });
  update(initial); fill(initial.settings);
  const countdown = setInterval(() => { renderQuota(element('codex-quotas'), state.codex, false, demo); element('codex-status').textContent = quotaStatus(state.codex, demo); }, 30000);
  return { update, dispose: () => { clearInterval(countdown); } };
}
