import { localBalanceTime } from '../../../shared/deepseek-time';
import type { DaySummary, LedgerSummary } from '../../../shared/types';
import { money } from '../../format';
import { sparkBars } from '../../ui/components';

const RECENT_ROWS = 14;

function foldNotes(label: string, ...notes: Element[]) {
  const details = document.createElement('details');
  details.className = 'account-notes';
  const summary = document.createElement('summary');
  summary.textContent = label;
  details.append(summary, ...notes);
  return details;
}

export function mountAccounts(overview: HTMLElement, codex: HTMLElement, gemini: HTMLElement, records: HTMLElement) {
  const balanceAction = overview.querySelector('.key-panel')!;
  const refresh = overview.querySelector('#refresh')!;
  refresh.className = 'secondary-button';
  balanceAction.querySelector('div')!.append(refresh);
  const keyNote = balanceAction.querySelector('.hint')!;
  const period = overview.querySelector('.deepseek-period')!;
  const periodRule = period.querySelector('#deepseek-period-rule')!;
  period.querySelector('details')!.remove();
  const links = overview.querySelector('.related-links')!;
  overview.querySelector('.today-card p')!.remove();
  overview.append(links, foldNotes('余额查询与计费时段', periodRule, keyNote));
  for (const section of [codex, gemini]) {
    const panel = section.querySelector('.panel')!;
    const note = panel.querySelector(':scope > .hint')!;
    panel.append(foldNotes('额度读取说明', note));
  }

  const panel = records.querySelector('.panel')!;
  const table = panel.querySelector<HTMLTableElement>('table')!;
  table.id = 'records-table';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'records-show-all';
  toggle.className = 'text-button';
  toggle.setAttribute('aria-controls', table.id);
  const periodNote = panel.querySelector('#records-period')!;
  const note = panel.querySelector('.statistics-note')!;
  note.querySelector('strong')!.remove();
  panel.append(toggle, foldNotes('消费统计口径', periodNote, note));
  const chart = document.createElement('div');
  chart.className = 'records-chart';
  panel.prepend(chart);
  let expanded = false;
  let days: DaySummary[] = [];
  const renderRows = () => {
    const tbody = table.tBodies[0];
    tbody.replaceChildren();
    if (!days.length) {
      const cell = tbody.insertRow().insertCell();
      cell.colSpan = 3;
      cell.className = 'empty-records';
      cell.textContent = '连接账户后，从当天开始记录消费。';
    }
    for (const day of expanded ? days : days.slice(0, RECENT_ROWS)) {
      const row = tbody.insertRow();
      const zone = day.timeZone ? `${day.timeZone} · 分段始于 ${localBalanceTime(day.startedAt, day.timeZone)}` : '原北京时间 · UTC+08:00';
      for (const text of [`${day.date} · ${zone}`, money(day.spent, day.currency), money(day.increased, day.currency)]) {
        row.insertCell().textContent = text;
      }
    }
    toggle.hidden = days.length <= RECENT_ROWS;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '收起至最近 14 行' : `查看全部 ${days.length} 行`;
  };
  const renderChart = () => {
    chart.replaceChildren();
    chart.hidden = !days.length;
    const dates = [...new Set(days.map(day => day.date))].sort().slice(-RECENT_ROWS);
    const totals = new Map<DaySummary['currency'], Map<string, number>>();
    for (const day of days) {
      if (!dates.includes(day.date)) continue;
      const daily = totals.get(day.currency) ?? new Map<string, number>();
      daily.set(day.date, (daily.get(day.date) ?? 0) + Number(day.spent));
      totals.set(day.currency, daily);
    }
    for (const [currency, daily] of totals) {
      const heading = document.createElement('h3');
      heading.textContent = `每日已观测消费 · ${currency}`;
      const series = Array.from(daily, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
      const bars = sparkBars(heading.textContent, series.map(({ date, value }) => ({ label: `${date} ${money(String(value), currency)}`, value })));
      const range = document.createElement('p');
      const first = series[0].date, last = series.at(-1)!.date;
      range.className = 'hint';
      range.textContent = first === last ? first : `${first} 至 ${last}`;
      chart.append(heading, bars, range);
    }
  };
  toggle.addEventListener('click', () => { expanded = !expanded; renderRows(); });
  return {
    update(ledger: LedgerSummary) {
      days = [...ledger.history];
      const today = ledger.today;
      const existing = today ? days.findIndex(day => day.date === today.date && day.segmentId === today.segmentId) : -1;
      if (today && existing < 0) days.push(today);
      else if (today) days[existing] = today;
      days.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      if (days.length <= RECENT_ROWS) expanded = false;
      renderChart();
      renderRows();
    },
  };
}
