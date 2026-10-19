import type { CodexQuotaBucket, CodexQuotaState, CodexQuotaWindow, CodexResetCredit } from '../shared/types';
import './quota.css';

export function planLabel(plan: string | null): string {
  const name = plan?.trim();
  if (!name) return '套餐未知';
  return { plus: 'Plus', pro: 'Pro' }[name.toLowerCase() as 'plus' | 'pro'] ?? name;
}
export function quotaSlots(bucket: CodexQuotaBucket, main: boolean): { label: string; window: CodexQuotaWindow | null }[] {
  const windows = [bucket.primary, bucket.secondary].filter((value): value is CodexQuotaWindow => value !== null);
  if (!main) return windows.map(window => ({ label: windowLabel(window.windowMinutes), window }));
  const fiveHour = windows.find(window => window.windowMinutes === 300);
  return [{ label: '每周', window: windows.find(window => window.windowMinutes === 10080) ?? null },
    ...(fiveHour ? [{ label: '5H', window: fiveHour }] : []),
    ...windows.filter(window => window.windowMinutes !== 300 && window.windowMinutes !== 10080).map(window => ({ label: windowLabel(window.windowMinutes), window }))];
}
export function remainingLabel(value: number): string {
  return Number.isFinite(value) ? `${Number(Math.max(0, Math.min(100, value)).toFixed(1))}%` : '未知';
}

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
  return (quota.buckets.length > 0 || !!quota.resetCredits) && (quota.status === 'error' || quota.status === 'unavailable' || !quota.updatedAt || !Number.isFinite(Date.parse(quota.updatedAt)) || now - Date.parse(quota.updatedAt) > 180000);
}

export function resetCreditExpiry(credit: CodexResetCredit, now = Date.now(), timeZone?: string): string {
  if (credit.expiresAt === null) return '无到期限制';
  const instant = credit.expiresAt ? Date.parse(credit.expiresAt) : NaN;
  if (!Number.isFinite(instant)) return '截止时间未提供';
  const text = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset', ...(timeZone ? { timeZone } : {}) }).format(instant);
  return `${text}${instant <= now ? ' · 已到期，待刷新' : ''}`;
}

export function resetCreditsView(quota: CodexQuotaState, now = Date.now()) {
  const data = quota.resetCredits;
  if (!data) return { count: '重置卡：未提供', deadline: '', note: '', rows: [] as CodexResetCredit[], nearest: undefined as CodexResetCredit | undefined };
  const rows = [...(data.credits ?? [])].sort((a, b) => {
    const time = (c: CodexResetCredit) => c.expiresAt && Number.isFinite(Date.parse(c.expiresAt)) ? Date.parse(c.expiresAt) : Infinity;
    return time(a) - time(b);
  });
  const available = rows.filter(row => row.status === 'available');
  const nearest = available.find(row => row.expiresAt && Number.isFinite(Date.parse(row.expiresAt)));
  const partial = data.credits !== null && available.length < data.availableCount;
  const stale = quotaIsStale(quota, now);
  let deadline = '';
  if (data.availableCount > 0) {
    if (nearest) deadline = Date.parse(nearest.expiresAt!) <= now ? '已知卡片已到期 · 待刷新' : `最近已知截止 ${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nearest.expiresAt!))}`;
    else deadline = !partial && available.length > 0 && available.every(row => row.expiresAt === null) ? '无到期限制' : '截止时间未提供';
  }
  return {
    count: `重置卡 ${data.availableCount} 张${stale ? ' · 待刷新' : ''}`,
    deadline,
    note: data.credits === null ? '接口仅提供张数，截止时间未提供。' : partial ? '明细不完整，总张数以账户返回值为准；日期仅针对已知卡片。' : '',
    rows, nearest,
  };
}

export function quotaStatus(quota: CodexQuotaState, demo: boolean): string {
  if (demo) return '演示额度 · 非真实账户';
  if (quota.status === 'loading') return '正在读取 Codex 额度…';
  if (quotaIsStale(quota)) return '上次额度 · 数据待更新';
  return { idle: '尚未读取', ready: '已连接 Codex', unavailable: '未连接 Codex', error: '读取失败', loading: '正在读取' }[quota.status];
}

export function renderQuota(root: HTMLElement, quota: CodexQuotaState, compact: boolean, demo: boolean): void {
  root.replaceChildren();
  root.classList.toggle('quota-compact', compact);
  root.classList.toggle('quota-stale', quotaIsStale(quota));
  const add = (parent: HTMLElement, tag: string, className: string, text?: string) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  };
  add(root, 'span', 'quota-plan-badge', planLabel(quota.planType));
  if (!quota.buckets.length) {
    add(root, 'p', 'quota-empty', quota.status === 'loading' ? '正在读取额度与重置时间…' : '额度未知 · 请先登录本机 Codex。');
  }
  const main = quota.buckets.find(bucket => bucket.id.toLowerCase() === 'codex') ?? quota.buckets[0];
  for (const bucket of main ? [main, ...quota.buckets.filter(bucket => bucket !== main)] : []) {
    const card = add(root, 'article', 'quota-bucket');
    add(card, 'h3', 'quota-bucket-name', bucket.name);
    let windows = add(card, 'div', 'quota-windows');
    let extrasStarted = false;
    for (const slot of quotaSlots(bucket, bucket === main)) {
      if (bucket === main && slot.label !== '每周' && slot.label !== '5H' && !extrasStarted) {
        windows = add(card, 'div', 'quota-windows quota-extra-windows'); extrasStarted = true;
      }
      const quotaWindow = slot.window;
      const row = add(windows, 'div', 'quota-window');
      const title = add(row, 'div', 'quota-window-title');
      add(title, 'span', '', slot.label);
      add(title, 'span', '', '剩余');
      const remaining = quotaWindow && Number.isFinite(quotaWindow.remainingPercent) ? Math.max(0, Math.min(100, quotaWindow.remainingPercent)) : null;
      add(row, 'strong', 'quota-percentage', quotaWindow ? remainingLabel(quotaWindow.remainingPercent) : '未提供');
      if (!compact && remaining !== null) {
        const bar = document.createElement('progress'); bar.max = 100; bar.value = remaining;
        bar.setAttribute('aria-label', `${slot.label}剩余额度`); row.append(bar);
      }
      if (quotaWindow) {
        add(row, 'p', 'quota-countdown', resetCountdown(quotaWindow.resetsAt));
        if (!compact) add(row, 'p', 'quota-reset', `重置于 ${localTime(quotaWindow.resetsAt)} · 本地时间`);
      }
    }
    if (!bucket.primary && !bucket.secondary) add(card, 'p', 'quota-empty', '未提供额度窗口');
    if (!compact && (bucket.unlimitedCredits || bucket.creditsRemaining !== null)) add(card, 'p', 'quota-credits', bucket.unlimitedCredits ? '附加额度：不限' : `附加余额：${bucket.creditsRemaining}`);
  }
  const resets = resetCreditsView(quota);
  const resetCard = add(root, compact ? 'div' : 'section', 'quota-reset-credits');
  add(resetCard, compact ? 'span' : 'h3', 'quota-reset-count', resets.count);
  if (resets.deadline) {
    const deadline = add(resetCard, 'p', 'quota-reset-deadline', resets.deadline);
    if (resets.nearest) deadline.title = resetCreditExpiry(resets.nearest);
  }
  if (!compact) {
    if (resets.note) add(resetCard, 'p', 'hint', resets.note);
    if (quotaIsStale(quota)) add(resetCard, 'p', 'hint', '上次读取的数据，卡片状态与张数待刷新。');
    if (resets.rows.length) {
      const list = add(resetCard, 'ol', 'quota-reset-list');
      for (const credit of resets.rows) {
        const row = add(list, 'li', 'quota-reset-row');
        add(row, 'span', '', { available: '可用', redeeming: '处理中', redeemed: '已使用', unknown: '状态未知' }[credit.status]);
        add(row, 'span', '', resetCreditExpiry(credit));
      }
    }
  }
  if (!compact && quota.error) add(root, 'p', 'service-message', quota.error);
}
