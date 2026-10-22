import type { AppSettings, AppState, BubbleProfiles, BubbleScenario, BubbleStyle, DesktopApi, PetPersona, SoundSlot } from '../shared/types';
import { COMPLETION_SOURCES, DEFAULT_BUBBLE_PROFILES, PERSONAS, SCENARIO_LABELS, SCENARIOS, petPersona, resolveBubble } from '../shared/bubble-settings';
import { DEFAULT_PET, GPT_PET, GPT_DRAGON_PET } from '../shared/defaults';
import { mountPet } from './pet';
import { PersonaSoundPlayer } from './sounds';

export function mountBubbleEditor(root: HTMLElement, api: DesktopApi, initial: AppState, changed: () => void, notify: (text: string, error?: boolean) => void, acceptState: (state: AppState) => void) {
  let profiles = structuredClone(initial.settings.bubbleProfilesByPersona), persona = petPersona(initial), kind: BubbleScenario | 'base' = 'base';
  let state = initial, disposed = false, busy = false;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  root.innerHTML = `<p class="hint">三个桌宠独立保存；自定义 GPT 沿用原版 GPT。先调整基础设置，再为不同提示单独覆盖。金额、额度和系统状态由程序生成。</p>
    <div class="persona-tabs" role="group" aria-label="气泡桌宠">${PERSONAS.map((id, i) => `<button type="button" data-bubble-persona="${id}">${['小鲸鱼', '原版 GPT', '白龙'][i]}</button>`).join('')}</div>
    <label class="field-label" for="bubble-scenario">提示类型</label><select id="bubble-scenario"><option value="base">基础设置（所有气泡）</option>${SCENARIOS.map(id => `<option value="${id}">${SCENARIO_LABELS[id]}</option>`).join('')}</select>
    <div class="bubble-editor-grid"><div class="bubble-editor-fields">
      <div id="bubble-copy-fields"><label id="bubble-enabled-row" class="toggle-label"><span>显示此类气泡</span><input id="bubble-enabled" type="checkbox"></label>
      <label class="field-label" for="bubble-title">提示标题 · 最多 40 字符</label><input id="bubble-title" maxlength="40">
      <label class="field-label" for="bubble-copy">提示短句 · 最多 200 字符</label><textarea id="bubble-copy" maxlength="200" rows="3"></textarea><p class="hint">数据类气泡保留真实数据，在数据之外显示这段短句。陪伴短句列表继续在“陪伴短句”编辑。</p></div>
      <label id="bubble-time-override-row" class="toggle-label"><span>为此类提示单独设置时间</span><input id="bubble-time-override" type="checkbox"></label>
      <fieldset id="bubble-time-fields"><legend>显示时间</legend><label for="bubble-profile-duration">自动收起（1–60 秒）</label><input id="bubble-profile-duration" type="number" min="1" max="60" step="1"><label for="bubble-profile-hover">悬浮延长（0–60 秒，0 为关闭）</label><input id="bubble-profile-hover" type="number" min="0" max="60" step="1"></fieldset><p id="bubble-persistent-hint" class="hint" hidden>对话提醒常驻至点击，沿用当前外观；显示时间不适用于此类提醒。</p>
      <label id="bubble-style-override-row" class="toggle-label"><span>为此类提示单独设置外观</span><input id="bubble-style-override" type="checkbox"></label>
      <fieldset id="bubble-style-fields"><legend>气泡外观</legend><div class="bubble-colors">${(['background', 'ink', 'border', 'ring'] as const).map((key, i) => `<label for="bubble-color-${key}">${['背景', '文字', '边框与尾巴', '外圈'][i]}<input id="bubble-color-${key}" data-style="${key}" type="color"></label>`).join('')}</div>
      <label for="bubble-font">字体</label><select id="bubble-font" data-style="font"><option value="system">系统默认</option><option value="yahei">微软雅黑</option><option value="dengxian">等线</option><option value="kaiti">楷体</option></select>
      <label for="bubble-font-scale">字号比例 <output id="bubble-font-scale-value"></output></label><input id="bubble-font-scale" data-style="fontScale" type="range" min="0.75" max="1.25" step="0.05">
      <label for="bubble-opacity">背景不透明度 <output id="bubble-opacity-value"></output></label><input id="bubble-opacity" data-style="backgroundOpacity" type="range" min="0.6" max="1" step="0.05"></fieldset>
      <section id="bubble-completion-audio"><h3>完成音效</h3><label class="toggle-label"><span>播放此来源的完成音效<small>与气泡分别开关，隐藏桌宠时保持安静。</small></span><input id="bubble-sound-enabled" type="checkbox"></label>
      <label for="bubble-sound-volume">完成音效音量 <output id="bubble-sound-volume-value"></output></label><input id="bubble-sound-volume" type="range" min="0" max="1" step="0.05"><p id="bubble-sound-name" class="hint"></p>
      <div class="button-row">${[['choose', '更换音频'], ['preview', '试听'], ['stop', '停止'], ['reset', '恢复内置音效']].map(([action, label]) => `<button type="button" class="secondary-button" id="bubble-sound-${action}">${label}</button>`).join('')}</div><p id="bubble-sound-warning" class="sound-warning" role="status"></p><p class="hint">文件更换与恢复立即生效；开关、音量与文案保存后生效。试听使用草稿音量。</p></section>
      <div class="button-row"><button id="bubble-reset" class="text-button" type="button">恢复当前项默认</button><button id="bubble-inherit" class="text-button" type="button">取消当前分类覆盖</button></div>
    </div><div class="bubble-editor-preview"><strong>实际气泡预览 · 示例数据</strong><label for="bubble-preview-placement">气泡位置</label><select id="bubble-preview-placement"><option value="above">上方</option><option value="below">下方／倒挂</option></select><div id="bubble-preview-pet" inert></div><p class="hint">预览使用与桌宠相同的渲染和排版。编辑不会切换桌面上的角色。</p></div></div>`;
  for (const field of root.querySelectorAll('input, textarea, select')) field.setAttribute('form', 'settings-form');
  const audio = new PersonaSoundPlayer(api, (_slot, text) => { if (!disposed) q('#bubble-sound-warning').textContent = text; }, undefined, COMPLETION_SOURCES.map(source => `completion-${source}` as const));
  const fakeState = (): AppState => ({ ...state, petVisible: true, settings: { ...state.settings, bubbleProfilesByPersona: structuredClone(profiles), scale: .68, phrasesByPersona: { ...state.settings.phrasesByPersona, [persona]: ['工作一会儿，记得照顾自己。'] } },
    activePet: persona === 'whale' ? 'deepseek' : 'gpt', gptAppearance: persona === 'dragon' ? 'dragon' : 'classic', pet: persona === 'whale' ? DEFAULT_PET : persona === 'dragon' ? GPT_DRAGON_PET : GPT_PET,
    effectiveScale: .68, flipped: false, verticalFlipped: q<HTMLSelectElement>('#bubble-preview-placement').value === 'below', bubblePlacement: q<HTMLSelectElement>('#bubble-preview-placement').value === 'below' ? 'below' : 'above',
    status: 'ready', error: null, warning: null, alert: null, balance: { currency: 'CNY', total: '28.36', granted: '0', toppedUp: '28.36', isAvailable: true, observedAt: new Date().toISOString() },
    ledger: { today: { date: '2026-10-21', currency: 'CNY', spent: '1.24', increased: '0', startedAt: '' }, history: [] },
    codex: { resetCredits: null, planType: 'pro', status: 'ready', source: 'codex-app-server', available: true, updatedAt: new Date().toISOString(), error: null, buckets: [{ id: 'example', name: '示例额度', planType: 'pro', primary: { usedPercent: 24, remainingPercent: 76, windowMinutes: 300, resetsAt: new Date(Date.now() + 7200000).toISOString() }, secondary: { usedPercent: 42, remainingPercent: 58, windowMinutes: 10080, resetsAt: new Date(Date.now() + 604800000).toISOString() }, creditsRemaining: null, unlimitedCredits: false }] },
  });
  const previewApi: DesktopApi = { ...api, onConversationNotice: () => () => {}, onCodexCompletion: () => () => {}, onPetHidden: () => () => {}, onUpdateAvailable: () => () => {}, setBubbleVisible: () => {}, setInteractive: () => {} };
  const preview = mountPet(q('#bubble-preview-pet'), previewApi, fakeState(), true);
  const updatePreview = () => { preview.update(fakeState()); preview.preview(kind === 'base' ? 'completion-deepseek-harness' : kind); };
  const soundSlot = () => kind as SoundSlot;
  const renderAudio = () => {
    const completion = kind.startsWith('completion-'); q('#bubble-completion-audio').hidden = !completion;
    if (!completion) return;
    const rule = profiles[persona].rules[kind as BubbleScenario], metadata = state.sounds[persona][soundSlot()];
    q<HTMLInputElement>('#bubble-sound-enabled').checked = rule.soundEnabled;
    q<HTMLInputElement>('#bubble-sound-volume').value = String(rule.volume); q('#bubble-sound-volume-value').textContent = `${Math.round(rule.volume * 100)}%`;
    q('#bubble-sound-name').textContent = `${metadata.name} · ${metadata.isCustom ? '自定义' : '内置'}`;
    q('#bubble-sound-warning').textContent = metadata.warning ?? '';
    for (const button of root.querySelectorAll<HTMLButtonElement>('#bubble-completion-audio button')) button.disabled = busy;
  };
  const render = () => {
    const base = profiles[persona], config = kind === 'base' ? base : resolveBubble(profiles, persona, kind), rule = kind === 'base' ? null : base.rules[kind];
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-bubble-persona]')) button.setAttribute('aria-pressed', String(button.dataset.bubblePersona === persona));
    q<HTMLSelectElement>('#bubble-scenario').value = kind;
    q('#bubble-copy-fields').hidden = !rule;
    q('#bubble-enabled-row').hidden = !kind.startsWith('completion-') && !kind.startsWith('attention-') && !['low-balance', 'daily-budget', 'update'].includes(kind);
    q<HTMLInputElement>('#bubble-enabled').checked = rule?.enabled ?? true; q<HTMLInputElement>('#bubble-title').value = rule?.title ?? ''; q<HTMLTextAreaElement>('#bubble-copy').value = rule?.message ?? '';
    q('#bubble-time-override-row').hidden = !rule; q('#bubble-style-override-row').hidden = !rule;
    const persistent = kind.startsWith('completion-') || kind.startsWith('attention-');
    q('#bubble-time-override-row').hidden = !rule || persistent;
    q('#bubble-time-fields').hidden = persistent;
    q('#bubble-persistent-hint').hidden = !persistent;
    q<HTMLInputElement>('#bubble-time-override').checked = !!rule && Object.keys(rule.timing).length > 0;
    q<HTMLInputElement>('#bubble-style-override').checked = !!rule && Object.keys(rule.style).length > 0;
    q<HTMLFieldSetElement>('#bubble-time-fields').disabled = !!rule && !Object.keys(rule.timing).length;
    q<HTMLFieldSetElement>('#bubble-style-fields').disabled = !!rule && !Object.keys(rule.style).length;
    q<HTMLInputElement>('#bubble-profile-duration').value = String(config.timing.durationSeconds); q<HTMLInputElement>('#bubble-profile-hover').value = String(config.timing.hoverDelaySeconds);
    for (const field of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-style]')) field.value = String(config.style[field.dataset.style as keyof BubbleStyle]);
    q('#bubble-font-scale-value').textContent = `${Math.round(config.style.fontScale * 100)}%`; q('#bubble-opacity-value').textContent = `${Math.round(config.style.backgroundOpacity * 100)}%`;
    q('#bubble-inherit').hidden = !rule; renderAudio(); updatePreview();
  };
  root.addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    if (target.id === 'bubble-scenario' || target.id === 'bubble-preview-placement') return;
    const base = profiles[persona], rule = kind === 'base' ? null : base.rules[kind];
    if (target.id === 'bubble-style-override' && rule) rule.style = target.checked ? { ...resolveBubble(profiles, persona, kind as BubbleScenario).style } : {};
    else if (target.id === 'bubble-time-override' && rule) rule.timing = target.checked ? { ...resolveBubble(profiles, persona, kind as BubbleScenario).timing } : {};
    else if (target.dataset.style) {
      const key = target.dataset.style;
      Object.assign(rule ? rule.style : base.style, { [key]: ['fontScale', 'backgroundOpacity'].includes(key) ? Number(target.value) : target.value });
    } else if (target.id === 'bubble-profile-duration' || target.id === 'bubble-profile-hover') Object.assign(rule ? rule.timing : base.timing, { [target.id.endsWith('duration') ? 'durationSeconds' : 'hoverDelaySeconds']: Number(target.value) });
    else if (rule) {
      if (target.id === 'bubble-title') rule.title = target.value;
      if (target.id === 'bubble-copy') rule.message = target.value;
      if (target.id === 'bubble-enabled') rule.enabled = target.checked;
      if (target.id === 'bubble-sound-enabled') rule.soundEnabled = target.checked;
      if (target.id === 'bubble-sound-volume') rule.volume = Number(target.value);
    }
    changed();
    // Do not rewrite focused text inputs while typing (selection/IME stays intact).
    if (target.id.endsWith('-override')) render();
    else { const style = kind === 'base' ? base.style : resolveBubble(profiles, persona, kind).style; q('#bubble-font-scale-value').textContent = `${Math.round(style.fontScale * 100)}%`; q('#bubble-opacity-value').textContent = `${Math.round(style.backgroundOpacity * 100)}%`; q('#bubble-sound-volume-value').textContent = `${Math.round((rule?.volume ?? .35) * 100)}%`; updatePreview(); }
  });
  q('#bubble-scenario').addEventListener('change', () => { audio.stop(); kind = q<HTMLSelectElement>('#bubble-scenario').value as typeof kind; render(); });
  q('#bubble-preview-placement').addEventListener('change', updatePreview);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-bubble-persona]')) button.addEventListener('click', () => { audio.stop(); persona = button.dataset.bubblePersona as PetPersona; audio.sync(persona, state.sounds); render(); });
  q('#bubble-reset').addEventListener('click', () => {
    if (kind === 'base') { profiles[persona].style = structuredClone(DEFAULT_BUBBLE_PROFILES[persona].style); profiles[persona].timing = { ...DEFAULT_BUBBLE_PROFILES[persona].timing }; }
    else profiles[persona].rules[kind] = structuredClone(DEFAULT_BUBBLE_PROFILES[persona].rules[kind]);
    changed(); render();
  });
  q('#bubble-inherit').addEventListener('click', () => { if (kind !== 'base') { profiles[persona].rules[kind].style = {}; profiles[persona].rules[kind].timing = {}; changed(); render(); } });
  q('#bubble-sound-preview').addEventListener('click', () => { if (kind.startsWith('completion-')) { audio.stop(); void audio.play(soundSlot(), profiles[persona].rules[kind as BubbleScenario].volume); } });
  q('#bubble-sound-stop').addEventListener('click', () => audio.stop());
  for (const action of ['choose', 'reset'] as const) q(`#bubble-sound-${action}`).addEventListener('click', () => {
    if (busy || !kind.startsWith('completion-')) return;
    busy = true; audio.stop(); renderAudio();
    const selectedPersona = persona, slot = soundSlot(), previous = state.sounds[persona][slot].revision;
    void (action === 'choose' ? api.chooseSound(selectedPersona, slot) : api.resetSound(selectedPersona, slot)).then(next => { if (!disposed) { acceptState(next); notify(next.sounds[selectedPersona][slot].revision === previous ? '音效文件未更改。' : '音效文件设置已生效。'); } }).catch(error => { if (!disposed) notify(error instanceof Error ? error.message : '音效操作失败。', true); }).finally(() => { if (!disposed) { busy = false; renderAudio(); } });
  });
  audio.sync(persona, state.sounds); render();
  return {
    getProfiles: (): BubbleProfiles => structuredClone(profiles),
    fill: (settings: AppSettings) => { profiles = structuredClone(settings.bubbleProfilesByPersona); render(); },
    update: (next: AppState) => { state = next; audio.sync(persona, state.sounds); renderAudio(); },
    select: (scenario: BubbleScenario) => { kind = scenario; render(); },
    dispose: () => { disposed = true; audio.dispose(); preview.dispose(); },
  };
}
