import { COMPLETION_SOURCES, petPersona, resolveBubble, conversationEnabled } from '../shared/bubble-settings';
import { PhrasePlayback } from '../shared/phrases';
import { applyBubbleStyle } from './bubble-style';
import type { AppState, DesktopApi, BubbleScenario, CompletionSource, AlertNotice, ConversationNotice } from '../shared/types';
import { getPetLayout } from '../shared/pet-layout';
import { money } from './format';
import { localTime, quotaStatus, renderQuota } from './quota';
import { pageCount, nextPage, summaryText, usageStatus } from './bubble-pages';
import { PersonaSoundPlayer } from './sounds';

export function mountPet(root: HTMLElement, api: DesktopApi, initial: AppState, demo: boolean) {
  let completionQueue: ConversationNotice[] = [];
  let completionSource: CompletionSource = 'codex';
  let activeConversation: ConversationNotice | null = null;
  let completionActive = false, playback = 0;
  let hidden = !initial.petVisible;
  let pendingAlert: AlertNotice | null = null;
  let alertScenario: BubbleScenario = 'low-balance';
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  const completionSeen = new Set<string>();
  let noticeKind: 'usage' | 'completion' | 'attention' | 'update' = 'usage';
  let pendingUpdate: string | null = null;
  const updatesSeen = new Set<string>();
  const clearCompletionPending = () => { completionQueue = []; clearTimeout(completionTimer); };
  let state = initial, page = 0, visible = false, retention = false, hovered = false, disposed = false;
  let revision = 0, operation = 0, switching = false, refreshing = false, notice = '', lastAlertId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
  let interactive = false;
  const simple = () => state.settings.petMode === 'simple';
  const persona = petPersona;
  const scenario = (): BubbleScenario => retention ? 'retention' : notice ? noticeKind === 'completion' ? `completion-${completionSource}` : noticeKind === 'attention' ? `attention-${completionSource}` : noticeKind === 'update' ? 'update' : alertScenario : page === 0 ? 'usage' : page === 1 ? 'summary' : 'phrases';
  const rule = (kind = scenario()) => resolveBubble(state.settings.bubbleProfilesByPersona, persona(state), kind);
  const phrasePlayer = new PhrasePlayback();
  let roundPhrases: string[] = [];
  const beginRound = () => { const owner = persona(state); phrasePlayer.begin(owner, state.settings.phraseDisplayByPersona[owner]); roundPhrases = phrasePlayer.lines(state.settings.phrasesByPersona[owner]); };
  const phrases = () => roundPhrases;
  beginRound();
  root.innerHTML = `<div class="pet-canvas"><section class="pet-bubble" aria-live="polite" hidden><div class="bubble-top"><span class="bubble-label"></span><span class="bubble-page"></span><button class="bubble-mode" type="button"></button><button class="bubble-close" type="button" aria-label="关闭气泡">×</button></div><div class="bubble-content"><div class="bubble-balances"><span>余额<strong class="pet-balance"></strong></span><span class="pet-spent-group">今日已观测<strong class="pet-spent"></strong></span></div><div class="bubble-quota"></div><p class="bubble-message"></p></div><div class="pet-status"></div><div class="bubble-footer"><button class="bubble-refresh" type="button">刷新</button><button class="bubble-switch" type="button">换角色</button><button class="bubble-appearance" type="button">换造型</button><button class="bubble-settings" type="button">设置</button></div><div class="bubble-retention-actions" hidden><button class="bubble-confirm" type="button">继续切换</button><button class="bubble-cancel" type="button">再陪一会儿</button></div></section><button type="button" class="pet-character"><span class="pet-mirror"><img class="pet-image" draggable="false" alt=""></span>${demo ? '<span class="pet-demo">本地演示</span>' : ''}</button></div>`;
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = query('.pet-canvas'), character = query<HTMLButtonElement>('.pet-character'), image = query<HTMLImageElement>('.pet-image');
  const bubble = query('.pet-bubble'), message = query('.bubble-message'), quota = query('.bubble-quota'), status = query('.pet-status');
  const refresh = query<HTMLButtonElement>('.bubble-refresh'), confirm = query<HTMLButtonElement>('.bubble-confirm');
  let soundWarning = '';
  const sounds = new PersonaSoundPlayer(api, (_slot, text) => { soundWarning = text; status.textContent = text; status.title = text; });
  const completionSounds = new PersonaSoundPlayer(api, (_slot, text) => { soundWarning = text; status.textContent = text; }, undefined, COMPLETION_SOURCES.map(source => `completion-${source}` as const));
  const play = (name: 'press' | 'release') => { if (!simple() && state.settings.soundEnabled && state.settings.volume > 0) void sounds.play(name, state.settings.volume); };
  const setInteractive = (value: boolean) => { if (interactive !== value) { interactive = value; api.setInteractive(value); } };
  const endCompletion = () => { completionActive = false; activeConversation = null; playback++; completionSounds.stop(); };
  const flushNotices = () => { flushCompletion(); if (!completionActive && !completionQueue.length) { flushAlert(); flushUpdate(); } };
  const close = () => { clearTimeout(timer); endCompletion(); visible = false; retention = false; hovered = false; notice = ''; bubble.hidden = true; api.setBubbleVisible(false); queueMicrotask(flushNotices); };
  const persistent = () => visible && (noticeKind === 'completion' || noticeKind === 'attention') && !!notice;
  const schedule = (duration = rule().timing.durationSeconds * 1000) => { clearTimeout(timer); if (visible && !retention && !persistent() && !(hovered && rule().timing.hoverDelaySeconds > 0)) timer = setTimeout(close, duration); };
  const render = () => {
    const isGpt = state.activePet === 'gpt', total = simple() ? 1 : pageCount(phrases());
    if (page >= total) page = 0;
    const usage = page === 0 && !retention && !notice;
    const config = rule(); applyBubbleStyle(bubble, config.style); bubble.dataset.scenario = scenario();
    query('.bubble-label').textContent = simple() && usage ? '剩余额度' : config.title;
    query('.bubble-mode').textContent = simple() ? '完整模式' : '简洁模式';
    query('.bubble-mode').setAttribute('aria-label', simple() ? '切换到完整模式' : '切换到简洁模式');
    bubble.classList.toggle('simple-mode', simple());
    query('.pet-spent-group').hidden = simple();
    query('.bubble-page').textContent = simple() || retention || notice ? '' : `${page + 1}/${total}`;
    query('.bubble-balances').hidden = !usage || isGpt; quota.hidden = !usage || !isGpt;
    const fixed = notice ? noticeKind === 'completion' ? '' : noticeKind === 'attention' ? activeConversation?.kind === 'approval' ? '有操作需要你审批。' : '有问题需要你回答。' : notice : page === 1 ? summaryText(state) : page >= 2 ? phrases()[page - 2] ?? '' : '';
    message.hidden = usage && (simple() || !config.message);
    message.textContent = [fixed, config.message].filter(Boolean).join('\n');
    message.classList.toggle('bubble-caption', usage);
    if (usage && isGpt) renderQuota(quota, state.codex, true, demo, simple());
    query('.pet-balance').textContent = money(state.balance?.total, state.balance?.currency);
    query('.pet-spent').textContent = money(state.ledger.today?.spent, state.ledger.today?.currency);
    for (const number of bubble.querySelectorAll<HTMLElement>('.bubble-balances strong')) {
      number.style.fontSize = '';
      if (number.clientWidth > 0 && number.scrollWidth > number.clientWidth) { const size = parseFloat(getComputedStyle(number).fontSize); number.style.fontSize = `${size * number.clientWidth / number.scrollWidth}px`; }
    }
    status.textContent = isGpt ? `${quotaStatus(state.codex, demo)} · ${localTime(state.codex.updatedAt)} 更新` : usageStatus(state, demo);
    if (simple() && !isGpt && state.status === 'ready' && !demo) status.textContent = state.balance ? '余额已更新' : '余额未知';
    if (persistent()) status.textContent = noticeKind === 'completion' ? '点击气泡收起 · 前往原客户端查看' : '点击气泡收起 · 请在原客户端回应';
    if (soundWarning) status.textContent = soundWarning;
    status.title = soundWarning || (isGpt ? state.codex.error : state.error) || status.textContent;
    query('.bubble-footer').hidden = retention; query('.bubble-retention-actions').hidden = !retention;
    bubble.tabIndex = persistent() ? 0 : -1;
    bubble.classList.toggle('bubble-persistent', persistent());
    const updateNotice = Boolean(notice && noticeKind === 'update');
    query('.bubble-appearance').hidden = simple() || !isGpt || updateNotice;
    query('.bubble-refresh').hidden = updateNotice; query('.bubble-switch').hidden = simple() || updateNotice;
    query('.bubble-update').hidden = !updateNotice;
    refresh.disabled = refreshing || (isGpt ? state.codex.status === 'loading' : state.status === 'loading');
    refresh.textContent = refresh.disabled ? '刷新中' : '刷新'; confirm.disabled = switching;
    query<HTMLButtonElement>('.bubble-cancel').disabled = switching;
    query<HTMLButtonElement>('.bubble-appearance').disabled = switching;
    query<HTMLButtonElement>('.bubble-switch').disabled = switching;
  };
  const show = () => { visible = true; bubble.hidden = false; api.setBubbleVisible(true); render(); schedule(); };
  const flushUpdate = () => {
    if (simple()) { pendingUpdate = null; return; }
    if (!pendingUpdate || disposed || hidden || visible || drag || retention || switching || completionQueue.length || completionActive || pendingAlert) return;
    if (!rule('update').enabled) { pendingUpdate = null; return; }
    noticeKind = 'update'; notice = `发现新版本 v${pendingUpdate}，可在设置中下载并更新。`; pendingUpdate = null;
    show(); query('.bubble-content').scrollTop = 0;
  };
  const flushAlert = () => {
    if (simple()) { pendingAlert = null; return; }
    if (!pendingAlert || disposed || hidden || drag || retention || switching || completionActive || (visible && notice && noticeKind !== 'update')) return;
    const alert = pendingAlert; pendingAlert = null;
    if (!rule(alert.kind).enabled) return;
    alertScenario = alert.kind; noticeKind = 'usage';
    notice = `${alert.message}\n余额 ${money(state.balance?.total, state.balance?.currency)}；今日已观测 ${money(state.ledger.today?.spent, state.ledger.today?.currency)}。`;
    show(); query('.bubble-content').scrollTop = 0;
  };
  const flushCompletion = () => {
    if (!completionQueue.length || disposed || hidden || completionActive || drag || retention || switching) return;
    const priority = completionQueue.findIndex(event => event.kind !== 'completion');
    const event = completionQueue.splice(priority < 0 ? 0 : priority, 1)[0], source = event.source;
    if (!conversationEnabled(state.settings, event)) { queueMicrotask(flushNotices); return; }
    const config = rule(`${event.kind === 'completion' ? 'completion' : 'attention'}-${source}`);
    if (!config.enabled && (!config.soundEnabled || config.volume === 0)) { queueMicrotask(flushNotices); return; }
    completionSource = source; activeConversation = event; completionActive = true; const ticket = ++playback;
    completionSounds.stop();
    if (config.enabled) { noticeKind = event.kind === 'completion' ? 'completion' : 'attention'; notice = 'conversation'; show(); query('.bubble-content').scrollTop = 0; }
    if (event.kind === 'completion' && config.soundEnabled && config.volume > 0) {
      void completionSounds.play(`completion-${source}`, config.volume, !config.enabled).finally(() => {
        if (!disposed && ticket === playback && !config.enabled) { endCompletion(); flushNotices(); }
      });
    } else if (!config.enabled) { endCompletion(); queueMicrotask(flushNotices); }
  };
  const update = (next: AppState) => {
    if (disposed) return;
    revision++; const modeChanged = state.settings.petMode !== next.settings.petMode; const changedPet = persona(state) !== persona(next);
    const phrasesChanged = JSON.stringify([state.settings.phrasesByPersona, state.settings.phraseDisplayByPersona]) !== JSON.stringify([next.settings.phrasesByPersona, next.settings.phraseDisplayByPersona]);
    const timingChanged = JSON.stringify(state.settings.bubbleProfilesByPersona) !== JSON.stringify(next.settings.bubbleProfilesByPersona);
    if (changedPet || state.sounds[persona(state)].press.revision !== next.sounds[persona(next)].press.revision || state.sounds[persona(state)].release.revision !== next.sounds[persona(next)].release.revision) soundWarning = '';
    state = next; hidden = !state.petVisible; sounds.sync(persona(state), state.sounds); completionSounds.sync(persona(state), state.sounds);
    if (modeChanged) {
      page = 0; retention = false; pendingAlert = null; pendingUpdate = null;
      if (!completionActive) notice = '';
      if (simple()) { sounds.stop(); soundWarning = ''; }
    }
    completionQueue = completionQueue.filter(event => conversationEnabled(state.settings, event));
    if (activeConversation && !conversationEnabled(state.settings, activeConversation)) { if (visible) close(); else { endCompletion(); queueMicrotask(flushNotices); } }
    if (completionActive && !rule().soundEnabled) completionSounds.stop();
    if (simple() || !state.settings.soundEnabled || state.settings.volume <= 0) sounds.stop();
    if (changedPet || phrasesChanged) { beginRound(); page = 0; if (!completionActive) { retention = false; notice = ''; } }
    const scale = state.effectiveScale ?? state.settings.scale, layout = getPetLayout(state.flipped, state.bubblePlacement, state.pet);
    canvas.style.transform = `scale(${scale})`; root.style.width = `${360 * scale}px`; root.style.height = `${440 * scale}px`;
    for (const [element, rect] of [[character, layout.character], [bubble, layout.bubble]] as const) { element.style.left = `${rect.x}px`; element.style.top = `${rect.y}px`; element.style.width = `${rect.width}px`; element.style.height = `${rect.height}px`; }
    image.style.left = `${layout.image.x}px`; image.style.top = `${layout.image.y}px`; image.style.width = `${layout.image.width}px`; image.style.height = `${layout.image.height}px`;
    canvas.classList.toggle('flipped', state.flipped); canvas.classList.toggle('vertical-flipped', state.verticalFlipped); canvas.classList.toggle('bubble-below', state.bubblePlacement === 'below');
    canvas.classList.toggle('gpt-theme', state.activePet === 'gpt'); canvas.classList.toggle('dragon-theme', state.activePet === 'gpt' && state.gptAppearance === 'dragon'); image.src = state.pet.url;
    character.setAttribute('aria-label', `${state.pet.name}，${simple() ? '点击查看剩余额度' : '点击切换用量、小报告和陪伴短句'}，拖动调整位置，右键打开菜单`);
    render();
    if (state.alert && state.alert.id !== lastAlertId) { lastAlertId = state.alert.id; if (!hidden && !simple()) pendingAlert = state.alert; }
    flushAlert();
    if (changedPet || timingChanged || modeChanged) schedule();
    if (changedPet) flushNotices();
  };
  // Broadcasts may precede IPC resolution; an older response must not overwrite them.
  const run = async (action: () => Promise<AppState>, kind: 'refresh' | 'switch' | 'appearance' | 'mode') => {
    const ticket = ++operation, started = revision;
    if (kind === 'refresh') refreshing = true; else switching = true; render();
    try { const next = await action(); if (!disposed && ticket === operation && revision === started) update(next); if (!disposed && ticket === operation && kind === 'switch') { retention = false; page = 0; if (!completionActive) notice = ''; show(); } }
    catch (error) { if (!disposed && ticket === operation) { status.textContent = error instanceof Error ? error.message : '操作失败，请重试。'; status.title = status.textContent; } }
    finally { if (!disposed && ticket === operation) { refreshing = false; switching = false; refresh.disabled = state.activePet === 'gpt' ? state.codex.status === 'loading' : state.status === 'loading'; refresh.textContent = refresh.disabled ? '刷新中' : '刷新'; confirm.disabled = false; query<HTMLButtonElement>('.bubble-cancel').disabled = false; query<HTMLButtonElement>('.bubble-appearance').disabled = false; query<HTMLButtonElement>('.bubble-switch').disabled = false; flushNotices(); } }
  };
  const clicked = () => { if (retention || persistent()) return; endCompletion(); if (!visible) { page = 0; beginRound(); } else { page = simple() ? 0 : nextPage(page, phrases()); if (page === 0) beginRound(); } notice = ''; show(); if (page >= 2) phrasePlayer.viewed(page - 2); };
  character.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); drag = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false }; character.setPointerCapture(event.pointerId); character.classList.add('pressed'); setInteractive(true); play('press'); api.startDrag(); });
  character.addEventListener('pointermove', event => { if (drag?.id === event.pointerId && Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 5) drag.moved = true; });
  const endDrag = (event: PointerEvent, cancel = false) => { if (!drag || drag.id !== event.pointerId) return; const moved = drag.moved; drag = undefined; character.classList.remove('pressed'); api.endDrag(); play('release'); if (character.hasPointerCapture(event.pointerId)) character.releasePointerCapture(event.pointerId); if (!cancel && !moved) clicked(); flushNotices(); };
  character.addEventListener('pointerup', event => endDrag(event)); character.addEventListener('pointercancel', event => endDrag(event, true)); character.addEventListener('lostpointercapture', event => endDrag(event, true));
  character.addEventListener('click', event => { if (event.detail === 0) { play('press'); clicked(); play('release'); } });
  const menu = (event: Event) => { event.preventDefault(); void api.showMenu().catch(() => { status.textContent = '无法打开菜单，请重试。'; }); };
  character.addEventListener('contextmenu', menu); character.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) menu(event); });
  query('.bubble-mode').addEventListener('click', () => { void run(() => api.updateSettings({ petMode: simple() ? 'full' : 'simple' }), 'mode'); });
  query('.bubble-close').addEventListener('click', close);
  bubble.addEventListener('click', event => { if (persistent() && !(event.target instanceof Element && event.target.closest('button, a, input, select, textarea'))) close(); });
  bubble.addEventListener('keydown', event => { if (persistent() && event.target === bubble && ['Enter', ' '].includes(event.key)) { event.preventDefault(); close(); } });
  refresh.addEventListener('click', () => { void run(() => state.activePet === 'gpt' ? api.refreshCodexQuota() : api.refreshBalance(), 'refresh'); });
  query('.bubble-switch').addEventListener('click', () => { retention = true; clearTimeout(timer); render(); });
  confirm.addEventListener('click', () => { const target = state.activePet === 'gpt' ? 'deepseek' : 'gpt'; void run(() => api.selectPet(target), 'switch'); });
  query('.bubble-cancel').addEventListener('click', () => { retention = false; render(); schedule(); flushNotices(); });
  query('.bubble-appearance').addEventListener('click', () => { void run(() => api.selectGptAppearance(state.gptAppearance === 'dragon' ? 'classic' : 'dragon'), 'appearance'); });
  query('.bubble-settings').addEventListener('click', () => { void api.openSettings().catch(() => { status.textContent = '无法打开设置，请重试。'; }); });
  const updateButton = document.createElement('button'); updateButton.type = 'button'; updateButton.className = 'bubble-update'; updateButton.textContent = '查看更新'; updateButton.hidden = true;
  query('.bubble-footer').prepend(updateButton);
  updateButton.addEventListener('click', () => { close(); void api.openSettings('version').catch(() => { status.textContent = '无法打开版本页，请从托盘重试。'; }); });
  bubble.addEventListener('pointerenter', () => { hovered = true; if (rule().timing.hoverDelaySeconds > 0) clearTimeout(timer); });
  bubble.addEventListener('pointerleave', () => { hovered = false; if (rule().timing.hoverDelaySeconds > 0) schedule(rule().timing.hoverDelaySeconds * 1000); });
  const pointerMove = (event: PointerEvent) => { if (!drag) setInteractive(Boolean(event.target instanceof Element && event.target.closest('.pet-character, .pet-bubble'))); };
  const pointerLeave = () => { if (!drag) setInteractive(false); };
  const focusChange = () => setInteractive(Boolean(root.contains(document.activeElement) && document.activeElement !== document.body));
  document.addEventListener('pointermove', pointerMove); document.addEventListener('pointerleave', pointerLeave); root.addEventListener('focusin', focusChange); root.addEventListener('focusout', focusChange);
  api.setBubbleVisible(false); api.setInteractive(false); update(initial);
  const stopCompletion = api.onConversationNotice(event => {
    if (disposed || hidden || !event || typeof event.id !== 'string') return;
    const source = event.source;
    const key = `${source}:${event.kind}:${event.id}`;
    if (!COMPLETION_SOURCES.includes(source) || !['completion', 'question', 'approval'].includes(event.kind) || !conversationEnabled(state.settings, event) || completionSeen.has(key)) return;
    completionSeen.add(key);
    if (completionSeen.size > 500) completionSeen.delete(completionSeen.values().next().value!);
    if (event.kind !== 'completion' || !completionQueue.some(pending => pending.kind === 'completion' && pending.source === source)) completionQueue.push(event);
    clearTimeout(completionTimer); completionTimer = setTimeout(flushCompletion, 150);
  });
  const stopUpdate = api.onUpdateAvailable(event => {
    if (disposed || !event || typeof event.version !== 'string' || event.version.length > 100 || updatesSeen.has(event.version)) return;
    updatesSeen.add(event.version); pendingUpdate = event.version; flushUpdate();
  });
  const stopHidden = api.onPetHidden(() => { hidden = true; pendingUpdate = null; pendingAlert = null; clearCompletionPending(); close(); sounds.stop(); });
  const countdown = setInterval(() => { if (visible) render(); }, 30000);
  return { update, preview: (kind: BubbleScenario) => {
    if (simple() && kind !== 'usage' && !kind.startsWith('completion-') && !kind.startsWith('attention-')) return;
    endCompletion(); retention = kind === 'retention'; notice = ''; page = kind === 'summary' ? 1 : kind === 'phrases' ? 2 : 0;
    if (kind.startsWith('completion-')) { completionSource = kind.slice(11) as CompletionSource; noticeKind = 'completion'; notice = 'completion'; }
    else if (kind.startsWith('attention-')) { completionSource = kind.slice(10) as CompletionSource; noticeKind = 'attention'; notice = 'conversation'; }
    else if (kind === 'update') { noticeKind = 'update'; notice = '发现新版本 v9.9.9，可在设置中下载并更新。'; }
    else if (kind === 'low-balance' || kind === 'daily-budget') { alertScenario = kind; noticeKind = 'usage'; notice = `示例余额 ${money(state.balance?.total, state.balance?.currency)}；今日已观测 ${money(state.ledger.today?.spent, state.ledger.today?.currency)}。`; }
    show(); clearTimeout(timer);
  }, dispose: () => { disposed = true; pendingUpdate = null; clearCompletionPending(); stopCompletion(); stopHidden(); stopUpdate(); sounds.dispose(); completionSounds.dispose(); clearInterval(countdown); clearTimeout(timer); if (drag) api.endDrag(); api.setBubbleVisible(false); api.setInteractive(false); document.removeEventListener('pointermove', pointerMove); document.removeEventListener('pointerleave', pointerLeave); root.removeEventListener('focusin', focusChange); root.removeEventListener('focusout', focusChange); } };
}
