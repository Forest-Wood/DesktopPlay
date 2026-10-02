import type { AppState, DesktopApi } from '../shared/types';
import { updateMoney } from './format';

export function mountPet(root: HTMLElement, api: DesktopApi, initial: AppState, demo: boolean) {
  let state = initial;
  let bubbleVisible = false;
  let lastAlertId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
  let interactive = false;
  root.innerHTML = `<div class="pet-canvas"><section class="pet-bubble" aria-live="polite" hidden><div class="bubble-top"><span class="bubble-label">小鲸鱼的小报告</span><button class="bubble-close" type="button" aria-label="关闭气泡">×</button></div><p class="bubble-message"></p><div class="bubble-balances"><span>余额 <strong class="pet-balance">—</strong></span><span>今日 <strong class="pet-spent">—</strong></span></div><div class="bubble-footer"><span class="pet-status"></span><button class="bubble-settings" type="button">打开设置 ↗</button></div></section><button type="button" class="pet-character" aria-label="小鲸鱼，点击查看余额，拖动调整位置，右键打开菜单"><img class="pet-image" draggable="false" alt="">${demo ? '<span class="pet-demo">本地演示</span>' : ''}</button></div>`;
  const canvas = root.querySelector<HTMLElement>('.pet-canvas')!;
  const character = root.querySelector<HTMLButtonElement>('.pet-character')!;
  const image = root.querySelector<HTMLImageElement>('.pet-image')!;
  const bubble = root.querySelector<HTMLElement>('.pet-bubble')!;
  const message = root.querySelector<HTMLElement>('.bubble-message')!;
  const status = root.querySelector<HTMLElement>('.pet-status')!;
  const sounds = { press: new Audio('./assets/press.mp3'), release: new Audio('./assets/release.mp3') };
  const play = (name: keyof typeof sounds) => {
    if (!state.settings.soundEnabled || state.settings.volume <= 0) return;
    const sound = sounds[name]; sound.volume = state.settings.volume; sound.currentTime = 0;
    void sound.play().catch(() => {});
  };
  const setInteractive = (value: boolean) => { if (interactive !== value) { interactive = value; api.setInteractive(value); } };
  const close = () => { clearTimeout(timer); bubbleVisible = false; bubble.hidden = true; api.setBubbleVisible(false); };
  const show = (text: string, duration = 12000) => {
    clearTimeout(timer); bubbleVisible = true; message.textContent = text; bubble.hidden = false; api.setBubbleVisible(true);
    timer = setTimeout(close, duration);
  };
  const update = (next: AppState) => {
    state = next; const scale = state.effectiveScale ?? state.settings.scale;
    canvas.style.transform = `scale(${scale})`;
    root.style.width = `${360 * scale}px`; root.style.height = `${440 * scale}px`;
    canvas.classList.toggle('flipped', state.flipped); image.src = state.pet.url;
    character.setAttribute('aria-label', `${state.pet.name}，点击查看余额，拖动调整位置，右键打开菜单`);
    updateMoney(root.querySelector<HTMLElement>('.pet-balance')!, state.balance?.total, state.balance?.currency);
    updateMoney(root.querySelector<HTMLElement>('.pet-spent')!, state.ledger.today?.spent, state.ledger.today?.currency);
    status.textContent = demo ? '演示余额' : state.status === 'loading' ? '正在查看余额…' : state.status === 'error' ? '连接异常 · 请查看设置' : state.status === 'unconfigured' ? '先在设置中连接账户' : '今日消费为已观测变化';
    if (state.alert && state.alert.id !== lastAlertId) { lastAlertId = state.alert.id; show(state.alert.message, 18000); }
  };
  const clicked = () => {
    const phrases = state.settings.phrases;
    show(phrases.length ? phrases[Math.floor(Math.random() * phrases.length)]! : '工作一会儿，记得照顾自己呀。');
    void api.refreshBalance().then(update).catch(error => { show(error instanceof Error ? error.message : '暂时无法查看余额，请稍后再试。'); });
  };
  character.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); drag = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
    character.setPointerCapture(event.pointerId); character.classList.add('pressed'); setInteractive(true); play('press'); api.startDrag();
  });
  character.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId && Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 5) drag.moved = true;
  });
  const endDrag = (event: PointerEvent, cancel = false) => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved; drag = undefined; character.classList.remove('pressed'); api.endDrag(); play('release');
    if (character.hasPointerCapture(event.pointerId)) character.releasePointerCapture(event.pointerId);
    if (!cancel && !moved) clicked();
  };
  character.addEventListener('pointerup', event => endDrag(event));
  character.addEventListener('pointercancel', event => endDrag(event, true));
  character.addEventListener('lostpointercapture', event => endDrag(event, true));
  character.addEventListener('click', event => { if (event.detail === 0) { play('press'); clicked(); play('release'); } });
  const menu = (event: Event) => { event.preventDefault(); void api.showMenu().catch(() => show('无法打开菜单，请重试。')); };
  character.addEventListener('contextmenu', menu);
  character.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) menu(event); });
  root.querySelector('.bubble-close')!.addEventListener('click', close);
  root.querySelector('.bubble-settings')!.addEventListener('click', () => { void api.openSettings().catch(() => show('无法打开设置，请重试。')); });
  bubble.addEventListener('pointerenter', () => clearTimeout(timer));
  bubble.addEventListener('pointerleave', () => { if (bubbleVisible) timer = setTimeout(close, 8000); });
  const pointerMove = (event: PointerEvent) => {
    if (drag) return;
    const target = event.target instanceof Element ? event.target : null;
    setInteractive(Boolean(target?.closest('.pet-character, .pet-bubble')));
  };
  const pointerLeave = () => { if (!drag) setInteractive(false); };
  const focusChange = () => setInteractive(Boolean(root.contains(document.activeElement) && document.activeElement !== document.body));
  document.addEventListener('pointermove', pointerMove); document.addEventListener('pointerleave', pointerLeave); root.addEventListener('focusin', focusChange); root.addEventListener('focusout', focusChange);
  api.setBubbleVisible(false);
  api.setInteractive(false);
  update(initial);
  return { update, dispose: () => { clearTimeout(timer); if (drag) api.endDrag(); api.setBubbleVisible(false); api.setInteractive(false); document.removeEventListener('pointermove', pointerMove); document.removeEventListener('pointerleave', pointerLeave); Object.values(sounds).forEach(sound => sound.pause()); } };
}
