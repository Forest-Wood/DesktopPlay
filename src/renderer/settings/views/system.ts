import { formatUpdateDownloadDetail } from '../../../shared/app-update';
import type { AppState } from '../../../shared/types';

export function mountSystem(version: HTMLElement, uninstall: HTMLElement) {
  const card = version.querySelector('.app-update')!;
  card.setAttribute('aria-labelledby', 'update-title');
  card.querySelector('h3')!.id = 'update-title';
  card.querySelector('h3')!.insertAdjacentHTML('afterend', `<div class="version-route">
    <div><small>当前版本</small><strong id="update-current-version"></strong></div>
    <span aria-hidden="true">→</span>
    <div><small>最新版本</small><strong id="update-latest-version"></strong></div>
  </div>`);
  const find = <T extends HTMLElement = HTMLElement>(id: string) => card.querySelector<T>(`#${id}`)!;
  find('update-progress').setAttribute('aria-labelledby', 'update-status');
  const danger = uninstall.querySelector('.panel')!;
  danger.classList.add('danger-zone');
  danger.insertAdjacentHTML('afterbegin', '<h3>危险操作区</h3>');
  return {
    update(u: AppState['appUpdate']) {
      const labels = {
        idle: '尚未检查更新', checking: '正在检查更新…', current: '当前已是最新版本', available: `发现新版本 v${u.latestVersion}`,
        downloading: `正在下载 ${u.progress.toFixed(1)}%`, ready: `v${u.latestVersion} 已下载，重启后更新`, installing: '正在准备重启更新…',
        error: '更新暂未完成', unsupported: '当前运行模式不执行更新',
      };
      find('update-current-version').textContent = `v${u.currentVersion}`;
      find('update-latest-version').textContent = u.latestVersion ? `v${u.latestVersion}` : u.status === 'current' ? `v${u.currentVersion}` : '待检查';
      find('update-status').textContent = labels[u.status];
      find('update-mode').textContent = u.kind === 'portable' ? '免安装版 · 保留原文件名和位置' : u.kind === 'installed' ? '安装版 · 覆盖升级并保留用户数据' : '开发／演示模式';
      find('update-checked').textContent = u.checkedAt ? `上次检查：${new Date(u.checkedAt).toLocaleString()}` : '';
      find('update-error').textContent = u.error ?? '';
      find('update-announcement').hidden = !u.latestVersion;
      const releaseDate = u.releaseDate && Number.isFinite(Date.parse(u.releaseDate)) ? new Date(u.releaseDate).toLocaleDateString() : '';
      find('update-notes-version').textContent = u.latestVersion ? `v${u.latestVersion}${releaseDate ? ` · ${releaseDate}` : ''}` : '';
      find('update-notes').textContent = u.releaseNotes.trim() || '本版本未提供更新公告。';
      const progress = find<HTMLProgressElement>('update-progress');
      progress.value = u.progress;
      progress.hidden = u.status !== 'downloading';
      find('update-bytes').textContent = formatUpdateDownloadDetail(u);
      find<HTMLButtonElement>('update-check').disabled = ['unsupported', 'checking', 'downloading', 'installing'].includes(u.status);
      find('update-download').hidden = !u.latestVersion || !['available', 'error'].includes(u.status);
      find('update-cancel').hidden = u.status !== 'downloading';
      find('update-install').hidden = u.status !== 'ready';
    },
  };
}
