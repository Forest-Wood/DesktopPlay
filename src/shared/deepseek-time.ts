// Read the system zone afresh: Windows may change it while the app is running.
export const systemTimeZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone;

export function dateInZone(date: Date, timeZone = systemTimeZone()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function zoneLabel(date = new Date(), timeZone = systemTimeZone()): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date).find(p => p.type === 'timeZoneName')!.value;
  return `${timeZone} · ${offset.replace('GMT', 'UTC')}`;
}

export function localBalanceTime(value: string | undefined, timeZone = systemTimeZone()): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '尚未更新';
  return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

// 2026 State Council holiday calendar (including contiguous holiday leave).
// https://www.gov.cn/zhengce/content/202511/content_7047090.htm
// Weekends remain off-peak even on compensating workdays.
const holidays: Record<string, readonly (readonly [string, string])[]> = {
  '2026': [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'], ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']],
};
export const DEEPSEEK_PRICING_URL = 'https://api-docs.deepseek.com/quick_start/pricing/';

function periodAt(now: Date) {
  const beijingDate = dateInZone(now, 'Asia/Shanghai');
  const calendar = holidays[beijingDate.slice(0, 4)];
  const day = beijingDate.slice(5);
  const holiday = calendar?.some(([start, end]) => day >= start && day <= end) ?? false;
  const weekday = new Date(`${beijingDate}T00:00:00Z`).getUTCDay();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const potentialPeak = weekday >= 1 && weekday <= 5 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
  const status = !potentialPeak || holiday ? 'off-peak' : calendar ? 'peak' : 'unknown';
  return { beijingDate, calendar, holiday, status } as const;
}

export type DeepseekTransition = { at: string; status: 'peak' | 'off-peak' };

function nextTransition(now: Date, current: ReturnType<typeof periodAt>): DeepseekTransition | null {
  if (current.status === 'unknown') return null;
  const day = new Date(`${current.beijingDate}T00:00:00Z`);
  // A full calendar cycle bounds the search even if a future calendar has no peaks.
  for (let offset = 0; offset < 366; offset++, day.setUTCDate(day.getUTCDate() + 1)) {
    for (const hour of [9, 12, 14, 18]) {
      const candidate = new Date(`${day.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00+08:00`);
      if (candidate.getTime() <= now.getTime()) continue;
      const { status } = periodAt(candidate);
      if (status === 'unknown') return null;
      if (status !== current.status) return { at: candidate.toISOString(), status };
    }
  }
  return null;
}

export function deepseekPeriod(now = new Date(), timeZone = systemTimeZone()) {
  const current = periodAt(now);
  const { beijingDate, calendar, holiday, status } = current;
  const format = (hour: number) => new Intl.DateTimeFormat('zh-CN', { timeZone, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`${beijingDate}T${String(hour).padStart(2, '0')}:00:00+08:00`));
  return {
    status,
    label: status === 'peak' ? '当前高峰' : status === 'off-peak' ? '当前低谷' : '当前时段待核实',
    zone: zoneLabel(now, timeZone),
    note: calendar ? '' : '节假日待核实',
    // Include dates and weekdays: the converted windows can fall on another local day.
    windows: `${format(9)} — ${format(12)}；${format(14)} — ${format(18)}`,
    holiday,
    nextTransition: nextTransition(now, current),
  };
}

export function deepseekBubblePeriod(now = new Date(), timeZone = systemTimeZone()) {
  const period = deepseekPeriod(now, timeZone), next = period.nextTransition;
  const date = next ? new Date(next.at) : null;
  const label = next?.status === 'peak' ? '高峰' : '低谷';
  const time = date ? new Intl.DateTimeFormat('zh-CN', { timeZone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : '';
  return {
    status: `API 时段：${period.label}${period.note && period.status !== 'unknown' ? `（${period.note}）` : ''}`,
    next: next ? `下次${label}：${time}` : '下次切换待核实',
    title: [`电脑时区：${period.zone}`, next && date ? `下次${label}：${localBalanceTime(next.at, timeZone)} · ${zoneLabel(date, timeZone)}` : '下次切换待核实', period.note, '北京时间周一至周五（中国法定节假日除外）09:00–12:00、14:00–18:00 为高峰，其余为低谷。仅表示模型调用收费时段。', DEEPSEEK_PRICING_URL].filter(Boolean).join('\n'),
  };
}
