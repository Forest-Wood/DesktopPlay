import type { AppState, DesktopApi, PetPersona } from '../shared/types';
import { getPetLayout } from '../shared/pet-layout';
import { money } from './format';
import { localTime, quotaStatus, renderQuota } from './quota';
import { pageCount, nextPage, summaryText, usageStatus } from './bubble-pages';

export function mountPet(root: HTMLElement, api: DesktopApi, initial: AppState, demo: boolean) {
  let state = initial, page = 0, visible = false, retention = false, hovered = false, disposed = false;
  let revision = 0, operation = 0, switching = false, refreshing = false, notice = '', lastAlertId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
  let interactive = false;
  const persona = (value: AppState): PetPersona => value.activePet === 'deepseek' ? 'whale' : value.gptAppearance === 'dragon' ? 'dragon' : 'gpt';
  const phrases = () => state.settings.phrasesByPersona[persona(state)];
  root.innerHTML = `<div class="pet-canvas"><section class="pet-bubble" aria-live="polite" hidden><div class="bubble-top"><span class="bubble-label"></span><span class="bubble-page"></span><button class="bubble-close" type="button" aria-label="关闭气泡">×</button></div><div class="bubble-content"><div class="bubble-balances"><span>余额<strong class="pet-balance"></strong></span><span>今日已观测<strong class="pet-spent"></strong></span></div><div class="bubble-quota"></div><p class="bubble-message"></p></div><div class="pet-status"></div><div class="bubble-footer"><button class="bubble-refresh" type="button">刷新</button><button class="bubble-switch" type="button">换角色</button><button class="bubble-appearance" type="button">换造型</button><button class="bubble-settings" type="button">设置</button></div><div class="bubble-retention-actions" hidden><button class="bubble-confirm" type="button">继续切换</button><button class="bubble-cancel" type="button">再陪一会儿</button></div></section><button type="button" class="pet-character"><span class="pet-mirror"><img class="pet-image" draggable="false" alt=""></span>${demo ? '<span class="pet-demo">本地演示</span>' : ''}</button></div>`;
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = query('.pet-canvas'), character = query<HTMLButtonElement>('.pet-character'), image = query<HTMLImageElement>('.pet-image');
  const bubble = query('.pet-bubble'), message = query('.bubble-message'), quota = query('.bubble-quota'), status = query('.pet-status');
  const refresh = query<HTMLButtonElement>('.bubble-refresh'), confirm = query<HTMLButtonElement>('.bubble-confirm');
  const sounds = { press: new Audio('./assets/press.mp3'), release: new Audio('./assets/release.mp3') };
  const play = (name: keyof typeof sounds) => { if (state.settings.soundEnabled && state.settings.volume > 0) { const sound = sounds[name]; sound.volume = state.settings.volume; sound.currentTime = 0; void sound.play().catch(() => {}); } };
  const setInteractive = (value: boolean) => { if (interactive !== value) { interactive = value; api.setInteractive(value); } };
  const close = () => { clearTimeout(timer); visible = false; retention = false; notice = ''; bubble.hidden = true; api.setBubbleVisible(false); };
  const schedule = (duration = 12000) => { clearTimeout(timer); if (visible && !retention && !hovered) timer = setTimeout(close, duration); };
  const render = () => {
    const isGpt = state.activePet === 'gpt', total = pageCount(phrases());
    if (page >= total) page = 0;
    const usage = page === 0 && !retention && !notice;
    query('.bubble-label').textContent = retention ? '再陪我一会儿吧' : notice ? '用量提醒' : page === 0 ? `${isGpt ? 'GPT' : 'DeepSeek'} 用量` : page === 1 ? '用量小报告' : '陪伴短句';
    query('.bubble-page').textContent = retention ? '' : `${page + 1}/${total}`;
    query('.bubble-balances').hidden = !usage || isGpt; quota.hidden = !usage || !isGpt;
    message.hidden = usage; message.textContent = retention ? (persona(state) === 'dragon' ? '翅膀还为你留着位置，再陪我一会儿吧。' : isGpt ? '代码还没写完呢，再陪我一会儿，好吗？' : '我还想陪着你，再留一会儿，好吗？') : notice || (page === 1 ? summaryText(state) : phrases()[page - 2] ?? '工作一会儿，记得照顾自己哦。');
    if (usage && isGpt) renderQuota(quota, state.codex, true, demo);
    query('.pet-balance').textContent = money(state.balance?.total, state.balance?.currency);
    query('.pet-spent').textContent = money(state.ledger.today?.spent, state.ledger.today?.currency);
    status.textContent = isGpt ? `${quotaStatus(state.codex, demo)} · ${localTime(state.codex.updatedAt)} 更新` : usageStatus(state, demo);
    status.title = (isGpt ? state.codex.error : state.error) || status.textContent;
    query('.bubble-footer').hidden = retention; query('.bubble-retention-actions').hidden = !retention;
    query('.bubble-appearance').hidden = !isGpt;
    refresh.disabled = refreshing || (isGpt ? state.codex.status === 'loading' : state.status === 'loading');
    refresh.textContent = refresh.disabled ? '刷新中' : '刷新'; confirm.disabled = switching;
    query<HTMLButtonElement>('.bubble-cancel').disabled = switching;
    query<HTMLButtonElement>('.bubble-appearance').disabled = switching;
    query<HTMLButtonElement>('.bubble-switch').disabled = switching;
  };
  const show = () => { visible = true; bubble.hidden = false; api.setBubbleVisible(true); render(); schedule(); };
  const update = (next: AppState) => {
    if (disposed) return;
    revision++; const changedPet = persona(state) !== persona(next); state = next;
    if (changedPet) { page = 0; retention = false; notice = ''; }
    const scale = state.effectiveScale ?? state.settings.scale, layout = getPetLayout(state.flipped, state.bubblePlacement, state.pet);
    canvas.style.transform = `scale(${scale})`; root.style.width = `${360 * scale}px`; root.style.height = `${440 * scale}px`;
    for (const [element, rect] of [[character, layout.character], [bubble, layout.bubble]] as const) { element.style.left = `${rect.x}px`; element.style.top = `${rect.y}px`; element.style.width = `${rect.width}px`; element.style.height = `${rect.height}px`; }
    image.style.left = `${layout.image.x}px`; image.style.top = `${layout.image.y}px`; image.style.width = `${layout.image.width}px`; image.style.height = `${layout.image.height}px`;
    canvas.classList.toggle('flipped', state.flipped); canvas.classList.toggle('vertical-flipped', state.verticalFlipped); canvas.classList.toggle('bubble-below', state.bubblePlacement === 'below');
    canvas.classList.toggle('gpt-theme', state.activePet === 'gpt'); canvas.classList.toggle('dragon-theme', state.activePet === 'gpt' && state.gptAppearance === 'dragon'); image.src = state.pet.url;
    character.setAttribute('aria-label', `${state.pet.name}，点击切换用量、小报告和陪伴短句，拖动调整位置，右键打开菜单`);
    render();
    if (state.activePet !== 'gpt' && state.alert && state.alert.id !== lastAlertId && !retention) { lastAlertId = state.alert.id; notice = state.alert.message; show(); }
    if (changedPet) schedule();
  };
  // Broadcasts may precede IPC resolution; an older response must not overwrite them.
  const run = async (action: () => Promise<AppState>, kind: 'refresh' | 'switch' | 'appearance') => {
    const ticket = ++operation, started = revision;
    if (kind === 'refresh') refreshing = true; else switching = true; render();
    try { const next = await action(); if (!disposed && ticket === operation && revision === started) update(next); if (!disposed && ticket === operation && kind === 'switch') { retention = false; page = 0; notice = ''; show(); } }
    catch (error) { if (!disposed && ticket === operation) { status.textContent = error instanceof Error ? error.message : '操作失败，请重试。'; status.title = status.textContent; } }
    finally { if (!disposed && ticket === operation) { refreshing = false; switching = false; refresh.disabled = state.activePet === 'gpt' ? state.codex.status === 'loading' : state.status === 'loading'; refresh.textContent = refresh.disabled ? '刷新中' : '刷新'; confirm.disabled = false; query<HTMLButtonElement>('.bubble-cancel').disabled = false; query<HTMLButtonElement>('.bubble-appearance').disabled = false; query<HTMLButtonElement>('.bubble-switch').disabled = false; } }
  };
  const clicked = () => { if (retention) return; page = visible ? nextPage(page, phrases()) : 0; notice = ''; show(); };
  character.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); drag = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false }; character.setPointerCapture(event.pointerId); character.classList.add('pressed'); setInteractive(true); play('press'); api.startDrag(); });
  character.addEventListener('pointermove', event => { if (drag?.id === event.pointerId && Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 5) drag.moved = true; });
  const endDrag = (event: PointerEvent, cancel = false) => { if (!drag || drag.id !== event.pointerId) return; const moved = drag.moved; drag = undefined; character.classList.remove('pressed'); api.endDrag(); play('release'); if (character.hasPointerCapture(event.pointerId)) character.releasePointerCapture(event.pointerId); if (!cancel && !moved) clicked(); };
  character.addEventListener('pointerup', event => endDrag(event)); character.addEventListener('pointercancel', event => endDrag(event, true)); character.addEventListener('lostpointercapture', event => endDrag(event, true));
  character.addEventListener('click', event => { if (event.detail === 0) { play('press'); clicked(); play('release'); } });
  const menu = (event: Event) => { event.preventDefault(); void api.showMenu().catch(() => { status.textContent = '无法打开菜单，请重试。'; }); };
  character.addEventListener('contextmenu', menu); character.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) menu(event); });
  query('.bubble-close').addEventListener('click', close);
  refresh.addEventListener('click', () => { void run(() => state.activePet === 'gpt' ? api.refreshCodexQuota() : api.refreshBalance(), 'refresh'); });
  query('.bubble-switch').addEventListener('click', () => { retention = true; clearTimeout(timer); render(); });
  confirm.addEventListener('click', () => { const target = state.activePet === 'gpt' ? 'deepseek' : 'gpt'; void run(() => api.selectPet(target), 'switch'); });
  query('.bubble-cancel').addEventListener('click', () => { retention = false; render(); schedule(); });
  query('.bubble-appearance').addEventListener('click', () => { void run(() => api.selectGptAppearance(state.gptAppearance === 'dragon' ? 'classic' : 'dragon'), 'appearance'); });
  query('.bubble-settings').addEventListener('click', () => { void api.openSettings().catch(() => { status.textContent = '无法打开设置，请重试。'; }); });
  bubble.addEventListener('pointerenter', () => { hovered = true; clearTimeout(timer); }); bubble.addEventListener('pointerleave', () => { hovered = false; schedule(8000); });
  const pointerMove = (event: PointerEvent) => { if (!drag) setInteractive(Boolean(event.target instanceof Element && event.target.closest('.pet-character, .pet-bubble'))); };
  const pointerLeave = () => { if (!drag) setInteractive(false); };
  const focusChange = () => setInteractive(Boolean(root.contains(document.activeElement) && document.activeElement !== document.body));
  document.addEventListener('pointermove', pointerMove); document.addEventListener('pointerleave', pointerLeave); root.addEventListener('focusin', focusChange); root.addEventListener('focusout', focusChange);
  api.setBubbleVisible(false); api.setInteractive(false); update(initial);
  const countdown = setInterval(() => { if (visible) render(); }, 30000);
  return { update, dispose: () => { disposed = true; clearInterval(countdown); clearTimeout(timer); if (drag) api.endDrag(); api.setBubbleVisible(false); api.setInteractive(false); document.removeEventListener('pointermove', pointerMove); document.removeEventListener('pointerleave', pointerLeave); root.removeEventListener('focusin', focusChange); root.removeEventListener('focusout', focusChange); Object.values(sounds).forEach(sound => sound.pause()); } };
}
