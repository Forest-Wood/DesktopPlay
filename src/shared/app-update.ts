import type { AppUpdateState } from './types';
import { APP_VERSION } from './defaults';

export function initialUpdateState(kind: AppUpdateState['kind'] = 'unsupported', version = APP_VERSION): AppUpdateState {
  return { kind, status: kind === 'unsupported' ? 'unsupported' : 'idle', currentVersion: version,
    latestVersion: null, releaseNotes: '', releaseDate: null, checkedAt: null, progress: 0, transferred: 0, total: 0,
    bytesPerSecond: null, estimatedRemainingSeconds: null,
    error: kind === 'unsupported' ? '开发或演示模式不执行软件更新。' : null };
}

export function formatUpdateSpeed(bytesPerSecond: number | null | undefined): string {
  if (typeof bytesPerSecond !== 'number' || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
  if (bytesPerSecond >= 1048576) return `${(bytesPerSecond / 1048576).toFixed(1)} MiB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KiB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

export function formatUpdateEta(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '预计剩余时间计算中…';
  if (seconds === 0) return '即将完成';
  const totalSeconds = Math.ceil(seconds);
  if (totalSeconds < 60) return `预计剩余约 ${totalSeconds} 秒`;
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return remainder === 0 || minutes >= 10 ? `预计剩余约 ${minutes} 分钟` : `预计剩余约 ${minutes} 分 ${remainder} 秒`;
  }
  const roundedMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `预计剩余约 ${hours} 小时` : `预计剩余约 ${hours} 小时 ${minutes} 分钟`;
}

export function formatUpdateDownloadDetail(update: Pick<AppUpdateState, 'status' | 'transferred' | 'total' | 'bytesPerSecond' | 'estimatedRemainingSeconds'>): string {
  if (update.status !== 'downloading') return '';
  if (update.total <= 0) return '正在连接下载源…';
  const size = `${(update.transferred / 1048576).toFixed(1)} / ${(update.total / 1048576).toFixed(1)} MiB`;
  const speed = formatUpdateSpeed(update.bytesPerSecond);
  const eta = formatUpdateEta(update.estimatedRemainingSeconds);
  return [size, speed, eta].filter(Boolean).join(' · ');
}
