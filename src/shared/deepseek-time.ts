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

export function deepseekPeriod(now = new Date(), timeZone = systemTimeZone()) {
  const beijingDate = dateInZone(now, 'Asia/Shanghai');
  const calendar = holidays[beijingDate.slice(0, 4)];
  const day = beijingDate.slice(5);
  const holiday = calendar?.some(([start, end]) => day >= start && day <= end) ?? false;
  const weekday = new Date(`${beijingDate}T00:00:00Z`).getUTCDay();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const potentialPeak = weekday >= 1 && weekday <= 5 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18));
  const status = !potentialPeak || holiday ? 'off-peak' : calendar ? 'peak' : 'unknown';
  const format = (hour: number) => new Intl.DateTimeFormat('zh-CN', { timeZone, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`${beijingDate}T${String(hour).padStart(2, '0')}:00:00+08:00`));
  return {
    status,
    label: status === 'peak' ? '当前高峰' : status === 'off-peak' ? '当前低谷' : '当前时段待核实',
    zone: zoneLabel(now, timeZone),
    note: calendar ? '' : '节假日待核实',
    // Include dates and weekdays: the converted windows can fall on another local day.
    windows: `${format(9)} — ${format(12)}；${format(14)} — ${format(18)}`,
    holiday,
  };
}
