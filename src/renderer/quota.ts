import type { CodexQuotaState } from '../shared/types';

export function windowLabel(minutes: number | null): string {
  if (minutes === 300) return '5 小时';
  if (minutes === 10080) return '每周';
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '额度窗口';
  return minutes % 1440 === 0 ? `${minutes / 1440} 天` : minutes % 60 === 0 ? `${minutes / 60} 小时` : `${minutes} 分钟`;
}

export function resetCountdown(value: string | null, now = Date.now()): string {
  const target = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(target)) return '重置时间未知';
  if (target <= now) return '已到重置时间 · 待刷新';
  const minutes = Math.ceil((target - now) / 60000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return `${[days ? `${days}天` : '', hours ? `${hours}小时` : '', rest || (!days && !hours) ? `${rest}分钟` : ''].filter(Boolean).join(' ')}后重置`;
}

export function localTime(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未知';
}

export function quotaIsStale(quota: CodexQuotaState, now = Date.now()): boolean {
  return quota.buckets.length > 0 && (quota.status === 'error' || quota.status === 'unavailable' || !quota.updatedAt || !Number.isFinite(Date.parse(quota.updatedAt)) || now - Date.parse(quota.updatedAt) > 180000);
}

export function quotaStatus(quota: CodexQuotaState, demo: boolean): string {
  if (demo) return '演示额度 · 非真实账户';
  if (quota.status === 'loading') return '正在读取 Codex 额度…';
  if (quotaIsStale(quota)) return '上次额度 · 数据待更新';
  return { idle: '尚未读取', ready: '已连接 Codex', unavailable: '未连接 Codex', error: '读取失败', loading: '正在读取' }[quota.status];
}

export function renderQuota(root: HTMLElement, quota: CodexQuotaState, compact: boolean, demo: boolean): void {
  root.replaceChildren();
  root.classList.toggle('quota-stale', quotaIsStale(quota));
  const add = (parent: HTMLElement, tag: string, className: string, text?: string) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  };
  if (!quota.buckets.length) {
    add(root, 'p', 'quota-empty', quota.status === 'loading' ? '正在读取额度与重置时间…' : '额度未知 · 请先登录本机 Codex。');
    if (!compact && quota.error) add(root, 'p', 'service-message', quota.error);
    return;
  }
  for (const bucket of quota.buckets) {
    const card = add(root, 'article', 'quota-bucket');
    add(card, 'h3', 'quota-bucket-name', `${bucket.name}${!compact && bucket.planType ? ` · ${bucket.planType}` : ''}`);
    const windows = add(card, 'div', 'quota-windows');
    for (const quotaWindow of [bucket.primary, bucket.secondary]) {
      if (!quotaWindow) continue;
      const row = add(windows, 'div', 'quota-window');
      const title = add(row, 'div', 'quota-window-title');
      add(title, 'span', '', windowLabel(quotaWindow.windowMinutes));
      const remaining = Number.isFinite(quotaWindow.remainingPercent) ? Math.max(0, Math.min(100, quotaWindow.remainingPercent)) : null;
      add(title, 'strong', '', remaining == null ? '未知' : `${Number(remaining.toFixed(1))}% 剩余`);
      if (!compact && remaining !== null) {
        const bar = document.createElement('progress'); bar.max = 100; bar.value = remaining;
        bar.setAttribute('aria-label', `${windowLabel(quotaWindow.windowMinutes)}剩余额度`); row.append(bar);
      }
      add(row, 'p', 'quota-countdown', resetCountdown(quotaWindow.resetsAt));
      if (!compact) add(row, 'p', 'quota-reset', `重置于 ${localTime(quotaWindow.resetsAt)} · 本地时间`);
    }
    if (!bucket.primary && !bucket.secondary) add(card, 'p', 'quota-empty', '未提供额度窗口');
    if (!compact && (bucket.unlimitedCredits || bucket.creditsRemaining !== null)) add(card, 'p', 'quota-credits', bucket.unlimitedCredits ? '附加额度：不限' : `附加余额：${bucket.creditsRemaining}`);
  }
  if (!compact && quota.error) add(root, 'p', 'service-message', quota.error);
}
