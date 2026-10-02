import './styles.css';
import type { AppState, DesktopApi } from '../shared/types';
import { createDemoApi } from './demo';
import { mountSettings } from './settings';
import { mountPet } from './pet';

const root = document.querySelector<HTMLDivElement>('#app')!;
const demo = !window.desktopPlay && !/Electron\//i.test(navigator.userAgent);
const api: DesktopApi | undefined = window.desktopPlay || (demo ? createDemoApi() : undefined);
const settings = new URLSearchParams(location.search).get('view') === 'settings';
document.body.className = settings ? 'settings-view' : 'pet-view';

if (!api) {
  root.innerHTML = '<div class="startup-error" role="alert">桌面连接未能建立。请关闭此窗口并重新启动 DesktopPet。</div>';
} else {
  let dispose: (() => void) | undefined;
  let update: ((state: AppState) => void) | undefined;
  let latest: AppState | undefined;
  const unsubscribe = api.onState(state => { latest = state; update?.(state); });
  api.getState().then(state => {
    const mounted = settings ? mountSettings(root, api, latest ?? state, demo) : mountPet(root, api, latest ?? state, demo);
    update = mounted.update; dispose = mounted.dispose;
  }).catch(() => { root.innerHTML = '<div class="startup-error" role="alert">无法读取应用状态。请重新启动 DesktopPet。</div>'; });
  window.addEventListener('beforeunload', () => { unsubscribe(); dispose?.(); });
}
