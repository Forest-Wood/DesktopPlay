const amountFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function money(value: string | null | undefined, currency: 'CNY' | 'USD' = 'CNY'): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${currency === 'USD' ? '$' : '¥'}${amountFormatter.format(Number(value))}`;
}

export function beijingTime(value: string | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '尚未更新';
  return timeFormatter.format(new Date(value));
}

// Keep eight decimal places in settings without passing monetary values through floating point.
export function decimalSetting(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d{1,8})?$/.test(trimmed)) throw new Error('提醒金额须为非负数，最多保留 8 位小数。');
  const [whole, fractional = ''] = trimmed.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fractional.padEnd(8, '0')}`;
}

const monetaryFrames = new WeakMap<HTMLElement, number>();
export function updateMoney(element: HTMLElement, value: string | null | undefined, currency: 'CNY' | 'USD' = 'CNY'): void {
  const identity = `${currency}:${value ?? ''}`;
  if (element.dataset.money === identity) return;
  const previous = element.dataset.moneyValue;
  const previousCurrency = element.dataset.moneyCurrency;
  const activeFrame = monetaryFrames.get(element);
  if (activeFrame !== undefined) cancelAnimationFrame(activeFrame);
  element.dataset.money = identity;
  element.dataset.moneyValue = value ?? '';
  element.dataset.moneyCurrency = currency;
  const target = value == null ? NaN : Number(value);
  const from = previous ? Number(previous) : NaN;
  if (!Number.isFinite(target) || !Number.isFinite(from) || previousCurrency !== currency || window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === target) {
    element.textContent = money(value, currency); return;
  }
  const started = performance.now();
  const frame = (now: number) => {
    const progress = Math.min(1, (now - started) / 320);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = progress === 1 ? money(value, currency) : money(String(from + (target - from) * eased), currency);
    if (progress < 1) monetaryFrames.set(element, requestAnimationFrame(frame));
    else monetaryFrames.delete(element);
  };
  monetaryFrames.set(element, requestAnimationFrame(frame));
}
