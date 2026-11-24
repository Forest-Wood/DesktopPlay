import { deepseekPeriod } from '../../../shared/deepseek-time';
import { BUILTIN_PETS } from '../../../shared/defaults';
import { petNickname } from '../../../shared/pet-nicknames';
import { REMINDER_SOURCES, reminderHealth } from '../../../shared/reminder-health';
import type { AppState, BuiltinPetId, CompletionSource } from '../../../shared/types';
import { money } from '../../format';
import { renderGeminiQuota } from '../../gemini-quota';
import { localTime, mainQuotaBucket, planLabel, quotaSlots, resetCountdown, resetCreditsView } from '../../quota';
import { card, personaPicker, ring, sparkBars, statusChip } from '../../ui/components';
import type { SettingsPage } from '../router';
import './home.css';

const accounts = [
  { id: 'deepseek', name: 'DeepSeek', page: 'overview', empty: '添加 API Key' },
  { id: 'gpt', name: 'Codex', page: 'codex', empty: '选择 codex.exe' },
  { id: 'gemini', name: 'Gemini', page: 'gemini', empty: '打开 Antigravity 或登录 agy' },
] as const;

type HomeActions = {
  navigate: (page: SettingsPage) => void;
  openReminder: (source: CompletionSource) => void;
  connectDeepSeek: () => void;
  connectCodex: () => void;
  refresh: (button: HTMLButtonElement) => void;
  toggleMode: (button: HTMLButtonElement) => void;
  checkUpdates: () => void;
  selectPet: (id: BuiltinPetId, button: HTMLButtonElement) => void;
  changeAppearance: (button: HTMLButtonElement) => void;
};

function text(tag: string, className: string, value: string) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function button(className: string, label: string, action: (control: HTMLButtonElement) => void) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = label;
  control.addEventListener('click', () => action(control));
  return control;
}

function accountStatus(status: string, hasData: boolean, demo: boolean) {
  if (demo) return { label: '演示', tone: 'info' } as const;
  if (status === 'loading') return { label: '刷新中', tone: 'info' } as const;
  if (status === 'ready') return { label: '正常', tone: 'ok' } as const;
  if (status === 'error' || hasData) return { label: hasData ? '异常 · 上次数据' : '异常', tone: 'err' } as const;
  return { label: '未连接', tone: 'off' } as const;
}

function homeDeepSeek(state: AppState, period: ReturnType<typeof deepseekPeriod>) {
  const balance = state.balance;
  const today = state.ledger.today;
  const history = [...state.ledger.history].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 7).reverse();
  const observed = document.createElement('div');
  observed.className = 'home-observed';
  const amount = document.createElement('div');
  amount.append(text('span', 'home-caption', '今日已观测'), text('strong', 'home-amount', money(today?.spent, today?.currency)));
  observed.append(amount);
  if (history.length) observed.append(sparkBars('最近观测消费', history.map(day => ({
    label: `${day.date} ${money(day.spent, day.currency)}`,
    value: Number(day.spent),
  }))));
  const periodLabel = text('span', 'home-period', period.label);
  periodLabel.dataset.period = period.status;
  periodLabel.title = `${period.zone}${period.note ? ` · ${period.note}` : ''}`;
  return [text('span', 'home-caption', '账户余额'),
    text('strong', 'home-balance', money(balance?.total, balance?.currency)), observed, periodLabel];
}

function homeCodex(state: AppState, now: number) {
  const quota = state.codex;
  const bucket = mainQuotaBucket(quota);
  const meters = document.createElement('div');
  meters.className = 'home-codex-meters';
  if (bucket) for (const slot of quotaSlots(bucket, true).filter(({ label }) => label === '每周' || label === '5H')) {
    const meter = document.createElement('div');
    const window = slot.window;
    const remaining = window?.remainingPercent;
    const label = `${slot.label}剩余额度`;
    meter.append(text('span', 'home-caption', label));
    if (remaining != null && Number.isFinite(remaining)) {
      const percent = Number(Math.max(0, Math.min(100, remaining)).toFixed(1));
      meter.append(ring(label, percent));
    } else meter.append(text('strong', 'home-meter-missing', '未提供'));
    if (window) meter.append(text('small', 'home-caption', resetCountdown(window.resetsAt, now)));
    meters.append(meter);
  }
  const nodes = [text('span', 'home-plan', planLabel(quota.planType ?? bucket?.planType ?? null))];
  if (meters.childElementCount) nodes.push(meters);
  if (quota.resetCredits) {
    const resets = resetCreditsView(quota, now);
    nodes.push(text('p', 'home-caption home-reset-cards', [resets.count, resets.deadline].filter(Boolean).join(' · ')));
  }
  return nodes;
}

function homeGemini(state: AppState) {
  const quotas = document.createElement('div');
  quotas.className = 'home-gemini-quotas';
  renderGeminiQuota(quotas, state.geminiQuota, true, false);
  return [text('span', 'home-plan', state.geminiQuota.planName ?? '套餐未提供'), quotas];
}

export function mountHome(root: HTMLElement, actions: HomeActions, demo: boolean) {
  root.innerHTML = `
    <div class="home-intro">
      <div><h2 id="home-heading"></h2><div class="home-summary"><span id="home-account-summary"></span></div></div>
      <div id="home-actions" class="home-actions"></div>
    </div>
    <div class="home-accounts" role="group" aria-label="账户总览"></div>
    <div class="home-bottom">
      <section class="ui-card home-reminders" aria-labelledby="home-reminders-title">
        <h2 id="home-reminders-title">对话提醒</h2><div class="home-reminder-list"></div>
      </section>
      <section class="ui-card home-partner" aria-labelledby="home-partner-title">
        <h2 id="home-partner-title">当前伙伴</h2>
        <div class="home-partner-detail"><div class="home-stage"><img alt=""></div><div><strong id="home-pet-name"></strong><small id="home-pet-mode"></small></div></div>
        <div class="home-actions"></div><div id="home-pet-choices" hidden></div>
      </section>
    </div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  let issue: CompletionSource | undefined;
  const issueLink = button('home-issues text-button', '', () => { if (issue) actions.openReminder(issue); });
  find('.home-summary').append(issueLink);
  const refresh = button('primary-button', '刷新全部', actions.refresh);
  const mode = button('secondary-button', '切换为简洁模式', actions.toggleMode);
  const updates = button('secondary-button', '检查更新', actions.checkUpdates);
  find('#home-actions').append(refresh, mode, updates);

  const accountGrid = find('.home-accounts');
  const accountViews = accounts.map(account => {
    const view = card();
    view.classList.add('home-account');
    view.dataset.account = account.id;
    const heading = document.createElement('h3');
    const openPage = button('home-account-link', account.name, () => actions.navigate(account.page));
    openPage.dataset.settingsPage = account.page;
    heading.append(openPage);
    const status = document.createElement('div');
    const top = document.createElement('div');
    top.className = 'home-account-head';
    top.append(heading, status);
    const content = document.createElement('div');
    content.className = 'home-account-data';
    const guide = text('p', 'home-caption home-gemini-guide', '请在已登录的 Antigravity 或 agy 中确认账户，再刷新额度。');
    guide.hidden = true;
    const connect = button('primary-button home-connect', account.empty, control => {
      if (account.id === 'deepseek') actions.connectDeepSeek();
      else if (account.id === 'gpt') actions.connectCodex();
      else {
        guide.hidden = !guide.hidden;
        control.setAttribute('aria-expanded', String(!guide.hidden));
      }
    });
    if (account.id === 'gemini') {
      guide.id = 'home-gemini-guide';
      connect.setAttribute('aria-controls', guide.id);
      connect.setAttribute('aria-expanded', 'false');
    }
    view.append(top, content, connect);
    if (account.id === 'gemini') view.append(guide);
    view.addEventListener('click', event => {
      if (!(event.target instanceof Element) || event.target.closest('button') || window.getSelection()?.toString()) return;
      actions.navigate(account.page);
    });
    accountGrid.append(view);
    return { view, status, content, connect, guide };
  });

  const reminders = REMINDER_SOURCES.map(([source, label]) => {
    const control = button('home-reminder', '', () => actions.openReminder(source));
    control.dataset.source = source;
    control.append(text('strong', 'home-reminder-name', label));
    const status = document.createElement('span');
    status.className = 'home-reminder-state';
    const channels = document.createElement('span');
    channels.className = 'home-reminder-channels';
    const last = text('small', 'home-caption home-reminder-time', '');
    control.append(status, channels, last);
    find('.home-reminder-list').append(control);
    return { source, status, channels, last };
  });

  const choices = find('#home-pet-choices');
  function toggleChoices(open: boolean) {
    choices.hidden = !open;
    pick.setAttribute('aria-expanded', String(open));
  }
  const pick = button('secondary-button', '换角色', () => {
    toggleChoices(choices.hasAttribute('hidden'));
    if (!choices.hidden) choices.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
  });
  pick.setAttribute('aria-controls', choices.id);
  pick.setAttribute('aria-expanded', 'false');
  const appearance = button('secondary-button', '换造型', actions.changeAppearance);
  find('.home-partner .home-actions').append(pick, appearance);
  const picker = personaPicker([
    { id: 'deepseek', label: '小鲸鱼', image: BUILTIN_PETS.deepseek.url },
    { id: 'gpt', label: 'GPT', image: BUILTIN_PETS.gpt.url },
    { id: 'gemini', label: 'Gemini', image: BUILTIN_PETS.gemini.url },
  ], 'deepseek');
  picker.setAttribute('aria-label', '切换桌宠角色');
  const roleOptions = [...picker.querySelectorAll<HTMLButtonElement>('button')];
  for (const option of roleOptions) option.addEventListener('click', () => {
    toggleChoices(false);
    pick.focus();
    actions.selectPet(option.dataset.value as BuiltinPetId, pick);
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { toggleChoices(false); pick.focus(); }
  });
  choices.append(picker);

  return {
    update(state: AppState, drafts: ReadonlySet<CompletionSource>, period: ReturnType<typeof deepseekPeriod>, now: Date) {
      const hour = now.getHours();
      find('#home-heading').textContent = hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
      const balanceData = !!state.balance;
      const codexData = !!(state.codex.buckets.length || state.codex.resetCredits || state.codex.planType);
      const geminiData = Object.values(state.geminiQuota.windows).some(window => window.remainingPercent !== null);
      const statuses = [
        accountStatus(state.balance?.isAvailable === false && state.status !== 'loading' ? 'error' : state.status, balanceData, demo),
        accountStatus(state.codex.status, codexData, demo),
        accountStatus(state.geminiQuota.status === 'error' && !state.geminiQuota.updatedAt ? 'idle' : state.geminiQuota.status, geminiData, demo),
      ];
      find('#home-account-summary').textContent = demo ? '3 个账户使用演示数据' : `${statuses.filter(({ tone }) => tone === 'ok').length} 个账户正常`;
      const data = [balanceData, codexData, geminiData];
      const contents = [homeDeepSeek(state, period), homeCodex(state, now.getTime()), homeGemini(state)];
      accountViews.forEach(({ view, status, content, connect, guide }, index) => {
        const stateChip = statuses[index];
        const active = state.activePet === accounts[index].id;
        view.dataset.active = String(active);
        const indicator = statusChip(stateChip.label, stateChip.tone);
        if (active) indicator.append(text('span', 'sr-only', '，当前伙伴的账户'));
        status.replaceChildren(indicator);
        content.replaceChildren(...contents[index]);
        connect.hidden = demo || data[index] || stateChip.label === '刷新中';
        if (connect.hidden && !guide.hidden) {
          guide.hidden = true;
          connect.setAttribute('aria-expanded', 'false');
        }
      });

      const statusesBySource = reminders.map(({ source, status, channels, last }) => {
        const health = reminderHealth(state, source, drafts.has(source));
        status.replaceChildren(statusChip(health.label, health.tone));
        channels.replaceChildren(
          text('span', `home-channel ${health.completion ? 'is-enabled' : ''}`, health.completion ? '完成开' : '完成关'),
          text('span', `home-channel ${health.attention ? 'is-enabled' : ''}`, health.attention ? '等待开' : '等待关'),
        );
        last.hidden = !health.lastAttentionAt;
        if (health.lastAttentionAt) last.textContent = `最近事件 ${localTime(health.lastAttentionAt)}`;
        return health;
      });
      const attention = statusesBySource.filter(({ tone }) => tone === 'err' || tone === 'warn');
      issue = (attention.find(({ tone }) => tone === 'err') ?? attention[0])?.source;
      issueLink.hidden = !issue;
      issueLink.textContent = `${attention.length} 个提醒来源待处理`;

      const simple = state.settings.petMode === 'simple';
      mode.textContent = simple ? '切换为完整模式' : '切换为简洁模式';
      find('#home-pet-mode').textContent = simple ? '简洁模式' : '完整模式';
      find('#home-pet-name').textContent = petNickname(state);
      find<HTMLImageElement>('.home-stage img').src = state.pet.url;
      for (const option of roleOptions) option.setAttribute('aria-pressed', String(option.dataset.value === state.activePet));
    },
  };
}
