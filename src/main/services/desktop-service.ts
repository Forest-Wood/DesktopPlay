import { dateInZone, systemTimeZone } from '../../shared/deepseek-time';
import { PERSONAS, validateBubbleProfiles } from '../../shared/bubble-settings';
import { phraseDisplays, validatePhraseDisplays } from '../../shared/phrases';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, DEFAULT_PHRASES_BY_PERSONA } from '../../shared/defaults';
import type { AppSettings, BalanceSnapshot, DaySummary, ServiceState } from '../../shared/types';

type Secrets = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string };
type Account = { timeZone?: string; segmentId?: string; balance: BalanceSnapshot | null; days: DaySummary[]; low: boolean; budgetDays: string[] };
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
    if (['autoCheckUpdates', 'alwaysOnTop', 'launchAtLogin', 'snapToEdges', 'soundEnabled', 'codexHookEnabled'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('开关设置无效');
    } else if (key === 'petMode') {
      if (value !== 'simple' && value !== 'full') throw new Error('桌宠模式无效');
    } else if (key === 'scale' || key === 'volume') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (key === 'scale' ? 0.5 : 0) || value > (key === 'scale' ? 2 : 1)) throw new Error('数值设置无效');
    } else if (key === 'bubbleDurationSeconds' || key === 'bubbleHoverDelaySeconds') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < (key === 'bubbleDurationSeconds' ? 1 : 0) || value > 60) throw new Error('气泡时间设置无效');
    } else if (['codexCompletionEnabled', 'chatgptCompletionEnabled', 'deepseekCompletionEnabled'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('完成提醒开关无效');
    } else if (key === 'codexCompletionDirectory' || key === 'deepseekCompletionDirectory') {
      if (value !== null && (typeof value !== 'string' || !path.isAbsolute(value) || value.startsWith('\\\\') || value.includes('\0') || value.length > 4096)) throw new Error('请选择有效的本机会话目录');
    } else if (key === 'bubbleProfilesByPersona') {
      validateBubbleProfiles(value);
    } else if (key === 'attentionEnabledBySource') {
      if (!plain(value) || Reflect.ownKeys(value).length !== 3 || ['codex', 'chatgpt-work', 'deepseek-harness'].some(source => { const descriptor = Object.getOwnPropertyDescriptor(value, source); return !descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'boolean'; })) throw new Error('等待回应开关无效');
    } else if (key === 'phraseDisplayByPersona') {
      validatePhraseDisplays(value); // Validate descriptors before cloning; check the final library below.
    } else if (key === 'completionMessagesByPersona') {
      if (!plain(value) || Reflect.ownKeys(value).length !== 3 || ['whale', 'gpt', 'dragon'].some(persona => !Object.hasOwn(value, persona) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, persona)!, 'value') || typeof value[persona] !== 'string' || !value[persona].trim() || value[persona].length > 200)) throw new Error('每个角色的完成提醒需为 1–200 字符的非空文本');
    } else if (key === 'phrases') {
      if (!validPhrases(value)) throw new Error('短句设置无效');
    } else if (key === 'phrasesByPersona') {
      if (!plain(value) || Reflect.ownKeys(value).length !== 3 || ['whale', 'gpt', 'dragon'].some(persona => !Object.hasOwn(value, persona) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, persona)!, 'value') || !validPhrases(value[persona]))) throw new Error('人设短句设置无效');
    } else if (value !== null) amount(value);
    Object.assign(result, { [key]: structuredClone(value) });
  }
  if (Object.hasOwn(patch, 'phrasesByPersona') && !Object.hasOwn(patch, 'phraseDisplayByPersona')) result.phraseDisplayByPersona = phraseDisplays(result.phrasesByPersona);
  validatePhraseDisplays(result.phraseDisplayByPersona, result.phrasesByPersona);
  // Legacy callers remain supported; the profile is authoritative when explicitly supplied.
  if (!Object.hasOwn(patch, 'bubbleProfilesByPersona')) for (const persona of PERSONAS) {
    const profile = result.bubbleProfilesByPersona[persona];
    if (Object.hasOwn(patch, 'bubbleDurationSeconds')) profile.timing.durationSeconds = result.bubbleDurationSeconds;
    if (Object.hasOwn(patch, 'bubbleHoverDelaySeconds')) profile.timing.hoverDelaySeconds = result.bubbleHoverDelaySeconds;
    if (Object.hasOwn(patch, 'completionMessagesByPersona')) {
      profile.rules['completion-codex'].message = result.completionMessagesByPersona[persona];
      profile.rules['completion-chatgpt-work'].message = result.completionMessagesByPersona[persona];
    }
  }
  return result;
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
    if (!/^[a-f0-9]{64}$/.test(id) || !plain(raw) || !Array.isArray(raw.days) || typeof raw.low !== 'boolean' || !Array.isArray(raw.budgetDays) || raw.budgetDays.some(d => typeof d !== 'string' || !/^(?:[a-f0-9-]{36}\/)?\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('账本无效');
    const validZone = (zone: unknown) => { if (typeof zone !== 'string') return false; try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; } };
    if ((raw.timeZone !== undefined || raw.segmentId !== undefined) && (!validZone(raw.timeZone) || typeof raw.segmentId !== 'string' || !/^[a-f0-9-]{36}$/.test(raw.segmentId))) throw new Error('设置或统计时区无效');
    const seen = new Set<string>();
    const days = raw.days.map(entry => {
      if (!plain(entry) || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || seen.has(`${entry.segmentId ?? 'legacy'}/${entry.date}`) || !['CNY', 'USD'].includes(entry.currency as string) || !validDate(entry.startedAt)) throw new Error('每日账本无效');
      if ((entry.timeZone !== undefined || entry.segmentId !== undefined) && (!validZone(entry.timeZone) || typeof entry.segmentId !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.segmentId))) throw new Error('设置或统计时区无效');
      seen.add(`${entry.segmentId ?? 'legacy'}/${entry.date}`); amount(entry.spent); amount(entry.increased);
      return { ...(entry.timeZone ? { timeZone: entry.timeZone as string, segmentId: entry.segmentId as string } : {}), date: entry.date, currency: entry.currency as 'CNY' | 'USD', spent: decimal(amount(entry.spent)), increased: decimal(amount(entry.increased)), startedAt: entry.startedAt };
    });
    accounts[id] = { ...(raw.timeZone ? { timeZone: raw.timeZone as string, segmentId: raw.segmentId as string } : {}), balance: raw.balance === null ? null : snapshot(raw.balance), days: days.slice(-365), low: raw.low, budgetDays: raw.budgetDays.slice(-365) as string[] };
  }
  const stored = structuredClone(value.settings);
  if (plain(stored) && plain(stored.bubbleProfilesByPersona)) for (const persona of PERSONAS) {
    const profile = stored.bubbleProfilesByPersona[persona];
    if (plain(profile) && plain(profile.rules)) for (const [scenario, rule] of Object.entries(DEFAULT_SETTINGS.bubbleProfilesByPersona[persona].rules)) {
      if (scenario.startsWith('attention-') && !Object.hasOwn(profile.rules, scenario)) profile.rules[scenario] = structuredClone(rule);
    }
  }
  const restoredSettings = settings(stored);
  if (plain(value.settings) && !Object.hasOwn(value.settings, 'chatgptCompletionEnabled')) restoredSettings.chatgptCompletionEnabled = restoredSettings.codexCompletionEnabled;
  if (plain(value.settings) && !Object.hasOwn(value.settings, 'phrasesByPersona')) {
    restoredSettings.phrasesByPersona = { whale: structuredClone(restoredSettings.phrases), gpt: [...DEFAULT_PHRASES_BY_PERSONA.gpt], dragon: [...DEFAULT_PHRASES_BY_PERSONA.dragon] };
  }
  if (plain(value.settings) && !Object.hasOwn(value.settings, 'phraseDisplayByPersona')) restoredSettings.phraseDisplayByPersona = phraseDisplays(restoredSettings.phrasesByPersona);
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
  private paused = false;
  private mutations: Promise<void> = Promise.resolve();
  private file: string;
  private fetchFn: typeof fetch;
  private now: () => Date;
  private observedZone?: string;
  private zoneRevision = 0;
  private pendingZoneReset = new Set<string>();
  constructor(private options: { dataDir: string; secrets: Secrets; fetchFn?: typeof fetch; now?: () => Date; timeZone?: () => string }) {
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
    this.startTimer();
    this.emit(); if (this.key) void this.refresh();
  }
  private fingerprint(key: string): string { return createHash('sha256').update(key).digest('hex'); }
  private validateKey(key: unknown): asserts key is string { if (typeof key !== 'string' || !key.trim() || key.length > 512 || /[\s\x00-\x1f\x7f]/.test(key)) throw new Error('密钥格式无效'); }
  private account(): Account | null { return this.id ? this.data.accounts[this.id] ?? null : null; }
  private timeZone(): string {
    const zone = this.options.timeZone?.() ?? systemTimeZone();
    if (this.observedZone !== undefined && this.observedZone !== zone) {
      this.zoneRevision++;
      for (const id of Object.keys(this.data.accounts)) this.pendingZoneReset.add(id);
    }
    this.observedZone = zone;
    return zone;
  }
  private today(account: Account | null, now = this.now(), pending = this.id ? this.pendingZoneReset.has(this.id) : false): DaySummary | null {
    const zone = this.timeZone();
    return !pending && account?.timeZone === zone ? account.days.find(d => d.date === dateInZone(now, zone) && d.segmentId === account.segmentId) ?? null : null;
  }
  getState(): ServiceState {
    this.timeZone();
    const account = this.account();
    return structuredClone({ settings: this.data.settings, hasApiKey: !!this.key, balance: account?.balance ?? null, ledger: { today: this.today(account), history: account?.days ?? [] }, status: this.status, error: this.error, warning: this.warning, alert: this.alert });
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
    settings(patch, this.data.settings); const copiedPatch = structuredClone(patch);
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
    if (this.disposed || this.paused || !this.key || !this.id) return Promise.resolve();
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
      const timeZone = this.timeZone(), zoneRevision = this.zoneRevision;
      if (account.timeZone !== timeZone || !account.segmentId || this.pendingZoneReset.has(id)) { account.timeZone = timeZone; account.segmentId = randomUUID(); }
      const date = dateInZone(new Date(balance.observedAt), timeZone); let summary = account.days.find(d => d.date === date && d.segmentId === account.segmentId);
      if (!summary) { summary = { date, timeZone, segmentId: account.segmentId, currency: balance.currency, spent: decimal(0n), increased: decimal(0n), startedAt: balance.observedAt }; account.days.push(summary); }
      else if (previous && dateInZone(new Date(previous.observedAt), timeZone) === date && previous.currency === balance.currency && summary.currency === balance.currency) {
        const difference = amount(previous.total) - amount(balance.total);
        if (difference > 0n) summary.spent = decimal(amount(summary.spent) + difference);
        else summary.increased = decimal(amount(summary.increased) - difference);
      } else if (summary.currency !== balance.currency) { throw new Error('余额币种已变化，请检查账户。'); }
      account.balance = balance; account.days = account.days.slice(-365); account.budgetDays = account.budgetDays.filter(d => account.days.some(s => `${s.segmentId ?? 'legacy'}/${s.date}` === d));
      const alert = this.evaluate(candidate, id, this.alert);
      await this.save(candidate); this.data = candidate; this.alert = alert;
      if (zoneRevision === this.zoneRevision) this.pendingZoneReset.delete(id);
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
    const summary = this.today(account, this.now(), false); const today = summary ? `${summary.segmentId}/${summary.date}` : ''; const budget = candidate.settings.dailyBudget;
    if (summary && budget !== null && amount(summary.spent) >= amount(budget) && !account.budgetDays.includes(today)) { account.budgetDays.push(today); alert = { id: randomUUID(), kind: 'daily-budget', message: '今日已观测消费达到预算。' }; }
    return alert;
  }
  private startTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { this.emit(); void this.refresh(); }, 60000); this.timer.unref?.();
  }
  pause(): void { this.paused = true; this.generation++; this.controller?.abort(); if (this.timer) clearInterval(this.timer); }
  resume(): void {
    if (this.disposed) return;
    this.paused = false;
    if (this.status === 'loading') this.status = this.key ? 'ready' : 'unconfigured';
    this.startTimer(); this.emit();
  }
  async drain(): Promise<void> { await this.inflight?.catch(() => {}); await this.mutations.catch(() => {}); }
  dispose(): void { this.disposed = true; this.pause(); this.listeners.clear(); }
}
