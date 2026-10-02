import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, DEFAULT_PHRASES_BY_PERSONA } from '../../shared/defaults';
import type { AppSettings, BalanceSnapshot, DaySummary, ServiceState } from '../../shared/types';

type Secrets = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string };
type Account = { balance: BalanceSnapshot | null; days: DaySummary[]; low: boolean; budgetDays: string[] };
type Disk = { version: 1; settings: AppSettings; key: string | null; accounts: Record<string, Account> };
const UNIT = 100000000n;
const MAX = 100000000000000000n;
function amount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,8})?$/.test(value)) throw new Error('金额格式无效');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * UNIT + BigInt(fraction.padEnd(8, '0'));
  if (result > MAX) throw new Error('金额超过允许范围');
  return result;
}
function decimal(value: bigint): string { return `${value / UNIT}.${(value % UNIT).toString().padStart(8, '0')}`; }
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validPhrases(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20 && value.every(v => typeof v === 'string' && !!v.trim() && v.length <= 200);
}
function settings(patch: unknown, base = DEFAULT_SETTINGS): AppSettings {
  if (!plain(patch)) throw new Error('设置格式无效');
  if (Reflect.ownKeys(patch).some(key => typeof key !== 'string' || !Object.hasOwn(DEFAULT_SETTINGS, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(patch, key)!, 'value'))) throw new Error('包含未知或危险设置');
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('包含未知设置');
    if (['alwaysOnTop', 'launchAtLogin', 'snapToEdges', 'soundEnabled'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('开关设置无效');
    } else if (key === 'scale' || key === 'volume') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (key === 'scale' ? 0.5 : 0) || value > (key === 'scale' ? 2 : 1)) throw new Error('数值设置无效');
    } else if (key === 'phrases') {
      if (!validPhrases(value)) throw new Error('短句设置无效');
    } else if (key === 'phrasesByPersona') {
      if (!plain(value) || Reflect.ownKeys(value).length !== 3 || ['whale', 'gpt', 'dragon'].some(persona => !Object.hasOwn(value, persona) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, persona)!, 'value') || !validPhrases(value[persona]))) throw new Error('人设短句设置无效');
    } else if (value !== null) amount(value);
    Object.assign(result, { [key]: structuredClone(value) });
  }
  return result;
}
function day(date: Date): string {
  // The ledger always follows Beijing time, independently of Windows timezone.
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function validDate(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function snapshot(value: unknown): BalanceSnapshot {
  if (!plain(value) || !['CNY', 'USD'].includes(value.currency as string) || typeof value.isAvailable !== 'boolean' || !validDate(value.observedAt)) throw new Error('余额数据无效');
  amount(value.total); amount(value.granted); amount(value.toppedUp);
  return { currency: value.currency as 'CNY' | 'USD', total: decimal(amount(value.total)), granted: decimal(amount(value.granted)), toppedUp: decimal(amount(value.toppedUp)), observedAt: value.observedAt, isAvailable: value.isAvailable };
}
function disk(value: unknown): Disk {
  if (!plain(value) || value.version !== 1 || !plain(value.accounts) || (value.key !== null && (typeof value.key !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.key)))) throw new Error('保存数据无效');
  const accounts: Record<string, Account> = {};
  for (const [id, raw] of Object.entries(value.accounts)) {
    if (!/^[a-f0-9]{64}$/.test(id) || !plain(raw) || !Array.isArray(raw.days) || typeof raw.low !== 'boolean' || !Array.isArray(raw.budgetDays) || raw.budgetDays.some(d => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('账本无效');
    const seen = new Set<string>();
    const days = raw.days.map(entry => {
      if (!plain(entry) || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || seen.has(entry.date) || !['CNY', 'USD'].includes(entry.currency as string) || !validDate(entry.startedAt)) throw new Error('每日账本无效');
      seen.add(entry.date); amount(entry.spent); amount(entry.increased);
      return { date: entry.date, currency: entry.currency as 'CNY' | 'USD', spent: decimal(amount(entry.spent)), increased: decimal(amount(entry.increased)), startedAt: entry.startedAt };
    });
    accounts[id] = { balance: raw.balance === null ? null : snapshot(raw.balance), days: days.slice(-365), low: raw.low, budgetDays: raw.budgetDays.slice(-365) as string[] };
  }
  const restoredSettings = settings(value.settings);
  if (plain(value.settings) && !Object.hasOwn(value.settings, 'phrasesByPersona')) {
    restoredSettings.phrasesByPersona = { whale: structuredClone(restoredSettings.phrases), gpt: [...DEFAULT_PHRASES_BY_PERSONA.gpt], dragon: [...DEFAULT_PHRASES_BY_PERSONA.dragon] };
  }
  return { version: 1, settings: restoredSettings, key: value.key as string | null, accounts };
}

export class DesktopService {
  private data: Disk = { version: 1, settings: structuredClone(DEFAULT_SETTINGS), key: null, accounts: {} };
  private key: string | null = null;
  private id: string | null = null;
  private status: ServiceState['status'] = 'unconfigured';
  private error: string | null = null;
  private warning: string | null = null;
  private alert: ServiceState['alert'] = null;
  private listeners = new Set<(state: ServiceState) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private controller?: AbortController;
  private inflight?: Promise<void>;
  private generation = 0;
  private disposed = false;
  private mutations: Promise<void> = Promise.resolve();
  private file: string;
  private fetchFn: typeof fetch;
  private now: () => Date;
  constructor(private options: { dataDir: string; secrets: Secrets; fetchFn?: typeof fetch; now?: () => Date }) {
    this.file = path.join(options.dataDir, 'desktopplay.json'); this.fetchFn = options.fetchFn ?? fetch; this.now = options.now ?? (() => new Date());
  }
  async init(): Promise<void> {
    await fs.mkdir(this.options.dataDir, { recursive: true });
    let recovered = false;
    for (const name of [this.file, `${this.file}.bak`]) {
      try { this.data = disk(JSON.parse(await fs.readFile(name, 'utf8'))); recovered = true; if (name !== this.file) this.warning = '已从备份恢复数据，损坏文件已保留。'; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        await fs.copyFile(name, `${name}.corrupt-${randomUUID()}`);
        this.warning = '保存数据损坏，原文件已保留，请检查备份。';
      }
    }
    if (this.data.key) {
      try { if (!this.options.secrets.isEncryptionAvailable()) throw new Error(); this.key = this.options.secrets.decryptString(Buffer.from(this.data.key, 'base64')); this.validateKey(this.key); this.id = this.fingerprint(this.key); this.status = 'ready'; }
      catch { this.warning = '无法解密已保存的密钥，请重新设置。'; }
    }
    if (!recovered && this.warning) this.status = 'unconfigured';
    this.timer = setInterval(() => { this.emit(); void this.refresh(); }, 60000); this.timer.unref?.();
    this.emit(); if (this.key) void this.refresh();
  }
  private fingerprint(key: string): string { return createHash('sha256').update(key).digest('hex'); }
  private validateKey(key: unknown): asserts key is string { if (typeof key !== 'string' || !key.trim() || key.length > 512 || /[\s\x00-\x1f\x7f]/.test(key)) throw new Error('密钥格式无效'); }
  private account(): Account | null { return this.id ? this.data.accounts[this.id] ?? null : null; }
  getState(): ServiceState {
    const account = this.account(); const today = day(this.now());
    return structuredClone({ settings: this.data.settings, hasApiKey: !!this.key, balance: account?.balance ?? null, ledger: { today: account?.days.find(d => d.date === today) ?? null, history: account?.days ?? [] }, status: this.status, error: this.error, warning: this.warning, alert: this.alert });
  }
  subscribe(callback: (state: ServiceState) => void): () => void { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) { try { listener(this.getState()); } catch { /* A renderer listener cannot interrupt persistence. */ } } }
  private mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.mutations.catch(() => {}).then(operation);
    this.mutations = result;
    return result;
  }
  private async save(candidate: Disk): Promise<void> {
    const payload = JSON.stringify(candidate);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        const handle = await fs.open(temporary, 'w', 0o600);
        try { await handle.writeFile(payload, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        let original: string | null = null;
        try { original = await fs.readFile(this.file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (original !== null) {
          let valid = false;
          try { disk(JSON.parse(original)); valid = true; } catch { /* Keep an invalid original outside the rotating backup. */ }
          if (valid) {
            const backupTemporary = `${temporary}.bak`;
            try { await fs.copyFile(this.file, backupTemporary); await fs.rename(backupTemporary, `${this.file}.bak`); } finally { await fs.rm(backupTemporary, { force: true }); }
          } else await fs.copyFile(this.file, `${this.file}.corrupt-${randomUUID()}`);
        }
        await fs.rename(temporary, this.file);
      } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    settings(patch); const copiedPatch = structuredClone(patch);
    await this.mutate(async () => {
      const candidate = structuredClone(this.data); candidate.settings = settings(copiedPatch, candidate.settings);
      const alert = this.evaluate(candidate, this.id, this.alert);
      await this.save(candidate); this.data = candidate; this.alert = alert; this.emit();
    });
  }
  async setApiKey(key: string): Promise<void> {
    this.validateKey(key); if (!this.options.secrets.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存密钥。');
    let encrypted: string; try { encrypted = this.options.secrets.encryptString(key).toString('base64'); } catch { throw new Error('密钥加密失败，请检查系统安全存储。'); }
    await this.mutate(async () => {
      const candidate = structuredClone(this.data); const id = this.fingerprint(key); candidate.key = encrypted;
      candidate.accounts[id] ??= { balance: null, days: [], low: false, budgetDays: [] };
      await this.save(candidate);
      this.generation++; this.controller?.abort(); this.inflight = undefined; this.data = candidate; this.key = key; this.id = id;
      this.status = 'ready'; this.error = null; this.alert = null; this.emit();
    });
    void this.refresh();
  }
  async clearApiKey(): Promise<void> {
    await this.mutate(async () => {
      const candidate = structuredClone(this.data); candidate.key = null; await this.save(candidate);
      this.generation++; this.controller?.abort(); this.inflight = undefined; this.data = candidate; this.key = null; this.id = null;
      this.status = 'unconfigured'; this.error = null; this.alert = null; this.emit();
    });
  }
  refresh(): Promise<void> {
    if (this.disposed || !this.key || !this.id) return Promise.resolve();
    if (this.inflight) return this.inflight;
    const generation = this.generation; const key = this.key; const id = this.id; const controller = new AbortController(); this.controller = controller;
    this.status = 'loading'; this.error = null; this.emit();
    const task = this.request(key, id, generation, controller).finally(() => { if (this.inflight === task) this.inflight = undefined; });
    this.inflight = task; return task;
  }
  private async request(key: string, id: string, generation: number, controller: AbortController): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('请求超时，请稍后重试。')); }, 10000); });
      const balance = await Promise.race([ (async () => {
        const response = await this.fetchFn('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? '密钥无效，请重新设置。' : response.status === 429 ? '请求过于频繁，请稍后重试。' : '余额服务暂时不可用，请稍后重试。');
        const raw: unknown = await response.json();
        if (!plain(raw) || typeof raw.is_available !== 'boolean' || !Array.isArray(raw.balance_infos) || !raw.balance_infos.length) throw new Error('余额响应格式无效。');
        const infos = raw.balance_infos.map(info => {
          if (!plain(info) || !['CNY', 'USD'].includes(info.currency as string)) throw new Error('余额响应格式无效。');
          return snapshot({ currency: info.currency, total: info.total_balance, granted: info.granted_balance, toppedUp: info.topped_up_balance, observedAt: this.now().toISOString(), isAvailable: raw.is_available });
        });
        if (new Set(infos.map(info => info.currency)).size !== infos.length) throw new Error('余额响应格式无效。');
        return infos.find(info => info.currency === 'CNY') ?? infos[0];
      })(), expired ]);
      await this.mutate(async () => {
      if (generation !== this.generation || this.disposed) return;
      const candidate = structuredClone(this.data);
      const account = candidate.accounts[id] ??= { balance: null, days: [], low: false, budgetDays: [] };
      const previous = account.balance;
      if (previous && Date.parse(balance.observedAt) < Date.parse(previous.observedAt)) throw new Error('系统时间早于上次观测，请校准时间后重试。');
      const date = day(new Date(balance.observedAt)); let summary = account.days.find(d => d.date === date);
      if (!summary) { summary = { date, currency: balance.currency, spent: decimal(0n), increased: decimal(0n), startedAt: balance.observedAt }; account.days.push(summary); }
      else if (previous && day(new Date(previous.observedAt)) === date && previous.currency === balance.currency && summary.currency === balance.currency) {
        const difference = amount(previous.total) - amount(balance.total);
        if (difference > 0n) summary.spent = decimal(amount(summary.spent) + difference);
        else summary.increased = decimal(amount(summary.increased) - difference);
      } else if (summary.currency !== balance.currency) { throw new Error('余额币种已变化，请检查账户。'); }
      account.balance = balance; account.days = account.days.slice(-365); account.budgetDays = account.budgetDays.filter(d => account.days.some(s => s.date === d));
      const alert = this.evaluate(candidate, id, this.alert);
      await this.save(candidate); this.data = candidate; this.alert = alert;
      if (generation !== this.generation || this.disposed) return; this.status = 'ready'; this.error = null;
      });
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.status = 'error';
      const message = error instanceof Error ? error.message : '';
      this.error = ['密钥无效，请重新设置。', '请求过于频繁，请稍后重试。', '余额服务暂时不可用，请稍后重试。', '余额响应格式无效。', '请求超时，请稍后重试。', '余额币种已变化，请检查账户。', '系统时间早于上次观测，请校准时间后重试。'].includes(message) ? message : '余额刷新失败，请检查网络或本地存储。';
    } finally { if (timeout) clearTimeout(timeout); if (generation === this.generation) this.emit(); }
  }
  private evaluate(candidate: Disk, id: string | null, previousAlert: ServiceState['alert']): ServiceState['alert'] {
    const account = id ? candidate.accounts[id] : null; if (!account?.balance) return previousAlert;
    let alert = previousAlert;
    const threshold = candidate.settings.lowBalanceThreshold;
    const low = threshold !== null && amount(account.balance.total) < amount(threshold);
    if (low && !account.low) alert = { id: randomUUID(), kind: 'low-balance', message: '余额低于设置的提醒金额。' };
    account.low = low;
    const today = day(this.now()); const summary = account.days.find(d => d.date === today); const budget = candidate.settings.dailyBudget;
    if (summary && budget !== null && amount(summary.spent) >= amount(budget) && !account.budgetDays.includes(today)) { account.budgetDays.push(today); alert = { id: randomUUID(), kind: 'daily-budget', message: '今日已观测消费达到预算。' }; }
    return alert;
  }
  dispose(): void { this.disposed = true; this.generation++; this.controller?.abort(); if (this.timer) clearInterval(this.timer); this.listeners.clear(); }
}
