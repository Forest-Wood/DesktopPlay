import { petPersona } from '../../../shared/bubble-settings';
import { REMINDER_SOURCES, reminderHealth } from '../../../shared/reminder-health';
import { reminderSetupSteps } from '../../../shared/reminder-setup';
import type { AppState, CompletionSource, DesktopApi, PetPersona } from '../../../shared/types';
import { localTime } from '../../quota';
import { PersonaSoundPlayer } from '../../sounds';
import { statusChip, stepList } from '../../ui/components';
import './reminders.css';

const statusLine = (id: string) => `<p id="${id}" class="hint" role="status"></p>`;
const directoryLine = (id: string) => `<p id="${id}" class="hint completion-path"></p>`;

const integrations: Record<CompletionSource, { name: string; method: string; markup: string; completionId?: string }> = {
  antigravity: {
    name: 'geminiCompletionEnabled', method: '会话摘要／Hook',
    markup: `<label class="toggle-label"><span>接入 Antigravity 完成 Hook<small>补充 agy CLI 的完成提醒，区分错误与取消。保存后写入全局 hooks.json，关闭只移除 DesktopPet 的条目。</small></span><input name="geminiHookEnabled" type="checkbox"></label>
      ${statusLine('gemini-integration-status')}`,
  },
  codex: {
    name: 'codexCompletionEnabled', method: '会话目录／Hook', completionId: 'completion-enabled',
    markup: `<label class="field-label" for="completion-directory">Codex 主目录</label>
      ${directoryLine('completion-current-directory')}<input id="completion-directory" type="text" readonly>
      <div class="button-row"><button id="completion-choose-directory" class="secondary-button" type="button">选择目录</button><button id="completion-default-directory" class="text-button" type="button">使用默认目录</button></div>
      ${statusLine('completion-status')}
      <label class="toggle-label"><span>启用 Codex CLI／IDE Hook 接入<small>保存后合并 hooks.json 并备份。关闭后移除 DesktopPet 的配置。</small></span><input name="codexHookEnabled" type="checkbox"></label>
      ${statusLine('codex-attention-status')}${directoryLine('codex-attention-directory')}
      <p id="codex-attention-draft" class="hint" hidden>接入设置尚未保存，监听使用上次保存的配置。</p>`,
  },
  'chatgpt-work': {
    name: 'chatgptCompletionEnabled', method: '原生通知日志',
    markup: `${statusLine('chatgpt-completion-status')}${statusLine('chatgpt-attention-status')}${directoryLine('chatgpt-attention-directory')}
      <p class="hint">Work 的回合结束通知可能包含失败或中止。等待回应遵循 ChatGPT 的原生通知规则。</p>`,
  },
  'deepseek-harness': {
    name: 'deepseekCompletionEnabled', method: '会话目录',
    markup: `<label class="field-label" for="dsh-directory">DSH 会话目录</label>
      ${directoryLine('dsh-current-directory')}<input id="dsh-directory" type="text" readonly>
      <div class="button-row"><button id="dsh-choose-directory" class="secondary-button" type="button">选择会话目录</button><button id="dsh-default-directory" class="text-button" type="button">使用默认目录</button></div>
      ${statusLine('dsh-completion-status')}
      <p class="hint">支持本机 v4 普通与压缩日志。目录及开关保存后生效。</p>`,
  },
};

const listenerLabels = {
  disabled: '完成提醒已关闭', starting: '正在连接本机会话…', watching: '正在监听新的完成事件',
  unavailable: '等待 Codex 会话', error: '会话监听异常',
};
const hookLabels = {
  disabled: 'Hook 接入尚未启动', starting: '已配置，等待实际提问或审批事件', watching: '已收到等待回应事件',
  unavailable: '客户端暂不支持 Hook', error: 'Codex Hook 接入异常',
};
const chatgptAttentionLabels = {
  disabled: 'ChatGPT App 监听尚未启动', starting: '正在连接 ChatGPT 桌面通知日志…',
  watching: '日志已连接，等待实际提问或审批事件', unavailable: '未找到 ChatGPT 桌面通知日志，请先启动 ChatGPT App',
  error: 'ChatGPT 桌面通知日志读取异常',
};
const chatgptCompletionLabels = {
  disabled: 'ChatGPT Work 提醒已关闭', starting: '正在连接 ChatGPT 桌面通知…', watching: '正在监听 ChatGPT 桌面结束通知',
  unavailable: '未找到 ChatGPT 桌面通知日志，请先启动桌面应用', error: 'ChatGPT 桌面通知监听异常',
};
const dshLabels = {
  disabled: 'DSH 提醒已关闭', starting: '正在连接 DSH 会话…', watching: '正在监听 DSH 新的完成事件',
  unavailable: '等待 DSH 会话', error: 'DSH 会话监听异常',
};

export function mountReminders(root: HTMLElement, balancePage: HTMLElement, api: DesktopApi, initial: AppState, volume: (persona: PetPersona, source: CompletionSource) => number) {
  const balanceCard = balancePage.firstElementChild as HTMLElement;
  root.innerHTML = `
    <div class="section-heading"><h2 id="reminder-matrix-title">对话提醒</h2></div>
    <p class="reminder-intro">完成和等待回应可分别开关，保存后生效。</p>
    <div class="reminder-matrix" role="table" aria-labelledby="reminder-matrix-title" aria-colcount="6">
      <div class="reminder-row reminder-matrix-head" role="row">
        ${['来源', '完成', '等待回应', '接入方式', '实时状态', '完成音效'].map(label => `<span role="columnheader">${label}</span>`).join('')}
      </div>
      ${REMINDER_SOURCES.map(([source, title]) => {
        const integration = integrations[source];
        const guide = `reminder-guide-${source}`;
        return `<div class="integration-card" role="rowgroup" data-source="${source}">
          <div class="reminder-row reminder-source-row" role="row">
            <strong class="reminder-source" role="rowheader">${title}</strong>
            <div class="reminder-channel reminder-completion" role="cell"><label>
              <span class="reminder-cell-caption" aria-hidden="true">完成</span>
              <input type="checkbox" ${integration.completionId ? `id="${integration.completionId}"` : ''} name="${integration.name}" aria-label="${title} 完成提醒">
            </label></div>
            <div class="reminder-channel reminder-attention" role="cell"><label>
              <span class="reminder-cell-caption" aria-hidden="true">等待回应</span>
              <input type="checkbox" name="attention-${source}" aria-label="${title} 等待回应提醒">
            </label></div>
            <div class="reminder-method" role="cell">
              <span class="reminder-cell-caption" aria-hidden="true">接入方式</span>
              <button type="button" class="reminder-disclosure text-button" data-reminder-guide aria-expanded="false" aria-controls="${guide}" aria-label="${title} 接入向导 · ${integration.method}">${integration.method}<span aria-hidden="true">⌄</span></button>
            </div>
            <div class="reminder-health" role="cell"><span class="reminder-health-chip"></span><small class="reminder-time" title="最近等待回应事件" hidden></small></div>
            <div class="reminder-audio" role="cell">
              <span class="reminder-cell-caption" aria-hidden="true">完成音效</span>
              <button type="button" class="secondary-button" data-preview-completion aria-label="试听 ${title} 完成音效">试听</button>
              <button type="button" class="text-button" data-edit-completion="${source}" aria-label="编辑 ${title} 完成音效">编辑 ↗</button>
            </div>
          </div>
          <div id="${guide}" class="reminder-guide" role="row" hidden><div role="cell" aria-colspan="6" class="reminder-guide-content">
            <div><h3>接入向导</h3><div class="reminder-steps"></div></div>
            <div class="reminder-configuration">${integration.markup}</div>
          </div></div>
        </div>`;
      }).join('')}
    </div>
    <p id="reminder-audio-status" class="hint sound-warning" role="status"></p>`;

  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const setText = (id: string, value: string) => {
    const node = find(`#${id}`);
    if (node.textContent !== value) node.textContent = value;
  };
  let state = initial;
  let previewPersona: PetPersona | undefined;
  let previewSource: CompletionSource | undefined;
  const audio = new PersonaSoundPlayer(api, (slot, warning) => {
    if (slot === `completion-${previewSource}`) setText('reminder-audio-status', warning);
  }, undefined, REMINDER_SOURCES.map(([source]) => `completion-${source}` as const));

  const rows = REMINDER_SOURCES.map(([source]) => {
    const row = find(`[data-source="${source}"]`);
    const disclosure = row.querySelector<HTMLButtonElement>('[data-reminder-guide]')!;
    const guide = row.querySelector<HTMLElement>('.reminder-guide')!;
    const steps = guide.querySelector<HTMLElement>('.reminder-steps')!;
    const updateSteps = () => steps.replaceChildren(stepList(reminderSetupSteps(state, source)));
    const setOpen = (open: boolean) => {
      guide.hidden = !open;
      disclosure.setAttribute('aria-expanded', String(open));
      if (open) updateSteps();
    };
    disclosure.addEventListener('click', () => setOpen(Boolean(guide.hidden)));
    row.querySelector('.reminder-source-row')!.addEventListener('click', event => {
      if (event.target instanceof Element && !event.target.closest('button, input, label')) {
        setOpen(Boolean(guide.hidden));
        disclosure.focus({ preventScroll: true });
      }
    });
    row.querySelector('[data-preview-completion]')!.addEventListener('click', () => {
      stopAudio();
      const persona = petPersona(state);
      const level = volume(persona, source);
      if (level <= 0) {
        setText('reminder-audio-status', '当前音量为零，可在气泡设置中调高后试听。');
        return;
      }
      previewPersona = persona;
      previewSource = source;
      setText('reminder-audio-status', '');
      audio.sync(persona, state.sounds);
      void audio.play(`completion-${source}`, level);
    });
    return {
      source, disclosure, guide, setOpen, updateSteps,
      chip: row.querySelector<HTMLElement>('.reminder-health-chip')!,
      time: row.querySelector<HTMLElement>('.reminder-time')!,
    };
  });

  function stopAudio() {
    audio.stop();
    previewPersona = undefined;
    previewSource = undefined;
    setText('reminder-audio-status', '');
  }

  return {
    showBalance(inMatrix: boolean) {
      const destination = inMatrix ? root : balancePage;
      if (balanceCard.parentElement !== destination) destination.append(balanceCard);
    },
    openGuide(source: CompletionSource) {
      const row = rows.find(item => item.source === source)!;
      row.setOpen(true);
      return row.disclosure;
    },
    update(next: AppState, drafts: ReadonlySet<CompletionSource>) {
      state = next;
      if (previewPersona === petPersona(state)) audio.sync(previewPersona, state.sounds);
      else if (previewPersona) stopAudio();
      for (const row of rows) {
        const health = reminderHealth(state, row.source, drafts.has(row.source));
        if (row.chip.firstElementChild?.getAttribute('data-tone') !== health.tone) row.chip.replaceChildren(statusChip(health.label, health.tone));
        row.time.hidden = !health.lastAttentionAt;
        row.time.textContent = health.lastAttentionAt ? localTime(health.lastAttentionAt) : '';
        if (!row.guide.hidden) row.updateSteps();
      }
      setText('gemini-integration-status', state.geminiIntegration);
      const codex = state.codexCompletion;
      const hook = state.codexAttention;
      setText('completion-status', [listenerLabels[codex.status], codex.error].filter(Boolean).join(' · '));
      setText('completion-current-directory', `当前目录：${codex.directory}`);
      const hookLabel = !state.settings.attentionEnabledBySource.codex ? 'Codex CLI／VS Code 等待提醒已关闭'
        : !state.settings.codexHookEnabled ? '未接入：等待提醒已开启，请开启 Hook 接入并保存设置'
        : hookLabels[hook.status];
      setText('codex-attention-status', [hookLabel, state.settings.codexHookEnabled ? hook.error : null, hook.lastAttentionAt ? `最近事件：${localTime(hook.lastAttentionAt)}` : null].filter(Boolean).join(' · '));
      setText('codex-attention-directory', `Hook 主目录：${hook.directory || codex.directory || '正在读取…'}`);
      find('#codex-attention-draft').hidden = !drafts.has('codex');
      const chatgpt = state.chatgptCompletion;
      const attentionLabel = !state.settings.attentionEnabledBySource['chatgpt-work'] ? 'ChatGPT App 等待提醒已关闭'
        : chatgpt.status === 'watching' && chatgpt.lastAttentionAt ? '已收到等待回应事件'
        : chatgptAttentionLabels[chatgpt.status];
      setText('chatgpt-attention-status', [attentionLabel, chatgpt.error, chatgpt.lastAttentionAt ? `最近事件：${localTime(chatgpt.lastAttentionAt)}` : null].filter(Boolean).join(' · '));
      setText('chatgpt-attention-directory', `通知日志目录：${chatgpt.directory || '正在读取…'}`);
      setText('chatgpt-completion-status', [chatgptCompletionLabels[chatgpt.status], chatgpt.error].filter(Boolean).join(' · '));
      const dsh = state.deepseekCompletion;
      setText('dsh-completion-status', [dshLabels[dsh.status], dsh.error].filter(Boolean).join(' · '));
      setText('dsh-current-directory', `当前目录：${dsh.directory}`);
    },
    stopAudio,
    dispose: () => audio.dispose(),
  };
}
