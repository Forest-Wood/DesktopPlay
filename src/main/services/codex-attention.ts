import { mkdir, readFile, writeFile, rename, readdir, rm, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { CodexCompletionState, ConversationNotice } from '../../shared/types';

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const EVENTS = ['PreToolUse', 'PermissionRequest'] as const;
export function supportsCodexHooks(executable: string | null): Promise<boolean> {
  if (!executable) return Promise.resolve(false);
  return new Promise(resolve => execFile(executable, ['exec', '--help'], { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 }, (error, stdout) => resolve(!error && stdout.includes('--dangerously-bypass-hook-trust'))));
}
export class CodexAttentionService {
  private state: CodexCompletionState = { status: 'disabled', directory: '', error: null, lastAttentionAt: null };
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  private enabled = false;
  private paused = false;
  private configured = '';
  private scope = '';
  private armedAt = Date.now();
  private serial: Promise<void> = Promise.resolve();
  private seen = new Set<string>();
  readonly inbox: string;
  constructor(private options: { dataDir: string; helperPath: string; onNotice: (notice: ConversationNotice) => void; onState?: () => void; pollMs?: number; isSupported?: () => Promise<boolean> }) { this.inbox = path.join(options.dataDir, 'integrations', 'codex', 'inbox'); }
  getState(): CodexCompletionState { return { ...this.state }; }
  private update(patch: Partial<CodexCompletionState>) { this.state = { ...this.state, ...patch }; this.options.onState?.(); }
  configure(enabled: boolean, directory: string, scope = ''): Promise<void> {
    const job = this.serial.catch(() => {}).then(async () => {
      if (this.disposed || (!this.paused && this.enabled === enabled && this.configured === directory && this.scope === scope && !['error', 'unavailable'].includes(this.state.status))) return;
      this.paused = false;
      clearInterval(this.timer);
      try {
        if (enabled && this.options.isSupported && !await this.options.isSupported()) { this.update({ status: 'unavailable', directory, error: '未找到支持官方 hook 的 Codex；请升级 CLI／IDE 使用的 Codex，或在账户页选择兼容程序。' }); return; }
        if (this.configured && this.configured !== directory && this.enabled) await this.install(this.configured, false);
        if (enabled || this.enabled) await this.install(directory, enabled);
        this.enabled = enabled; this.configured = directory; this.scope = scope; this.armedAt = Date.now(); this.seen.clear();
        this.update({ status: enabled ? 'starting' : 'disabled', directory, error: null, lastAttentionAt: null });
        if (enabled) {
          await mkdir(this.inbox, { recursive: true }); await this.scan();
          if (!this.disposed) { this.timer = setInterval(() => { void this.check(); }, this.options.pollMs ?? 1000); this.timer.unref(); }
        } else await rm(path.join(this.inbox, 'active'), { force: true });
      } catch { this.update({ status: 'error', directory, error: 'Codex hook 配置或事件读取失败；保留原配置，请检查目录权限或客户端 hook 支持后重新保存。' }); }
    });
    this.serial = job; return job;
  }
  private async install(directory: string, enabled: boolean): Promise<void> {
    const script = path.join(this.options.dataDir, 'integrations', 'codex', 'conversation-hook.ps1');
    const filename = path.join(directory, 'hooks.json');
    let original: string | null = null;
    try { original = await readFile(filename, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const config: unknown = original === null ? {} : JSON.parse(original.replace(/^\uFEFF/, ''));
    if (!plain(config) || (config.hooks !== undefined && !plain(config.hooks))) throw new Error('invalid-hooks');
    const hooks = config.hooks as Record<string, unknown> ?? {};
    // Literal PowerShell path, encoded so both cmd and PowerShell hosts preserve spaces/$/quotes.
    const invocation = Buffer.from(`& '${script.replace(/'/g, "''")}'`, 'utf16le').toString('base64');
    const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${invocation}`;
    for (const event of EVENTS) {
      const groups = hooks[event] ?? [];
      if (!Array.isArray(groups)) throw new Error('invalid-hook-groups');
      const retained = groups.map(group => {
        if (!plain(group) || !Array.isArray(group.hooks)) throw new Error('invalid-hook-group');
        return { ...group, hooks: group.hooks.filter(handler => !(plain(handler) && handler.command === command)) };
      }).filter(group => group.hooks.length);
      if (enabled) retained.push({ ...(event === 'PreToolUse' ? { matcher: '(^|[./])request_user_input(_async)?$' } : {}), hooks: [{ type: 'command', command, timeout: 3 }] });
      if (retained.length) hooks[event] = retained; else delete hooks[event];
    }
    config.hooks = hooks;
    if (enabled) {
      await mkdir(path.dirname(script), { recursive: true });
      const template = await readFile(this.options.helperPath, 'utf8');
      await writeFile(script, template.replace('__INBOX__', () => this.inbox.replace(/'/g, "''")), 'utf8');
    }
    if (original === null && !enabled) return;
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    if (original === payload) return;
    await mkdir(directory, { recursive: true });
    const temporary = `${filename}.desktoppet-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { flag: 'wx' });
      let latest: string | null = null;
      try { latest = await readFile(filename, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (latest !== original) throw new Error('hooks-changed-concurrently');
      if (original !== null) await copyFile(filename, `${filename}.desktoppet-backup-${randomUUID()}`);
      await rename(temporary, filename);
    } finally { await rm(temporary, { force: true }); }
  }
  check(): Promise<void> {
    const job = this.serial.catch(() => {}).then(async () => {
      if (this.disposed || this.paused || !this.enabled) return;
      try { await this.scan(); } catch { this.update({ status: 'error', error: '无法读取 Codex hook 事件，将自动重试。' }); }
    });
    this.serial = job; return job;
  }
  private async scan(): Promise<void> {
    await writeFile(path.join(this.inbox, 'active'), '');
    for (const name of await readdir(this.inbox)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const filename = path.join(this.inbox, name);
      try {
        if ((await stat(filename)).size > 4096) continue;
        const event: unknown = JSON.parse(await readFile(filename, 'utf8'));
        if (!plain(event) || event.source !== 'codex' || !['question', 'approval'].includes(event.kind as string) || typeof event.id !== 'string' || !/^[a-f0-9]{64}$/.test(event.id) || typeof event.occurredAt !== 'string') continue;
        // The desktop App already applies conversation-visibility rules in its native notifications.
        // CLI/IDE hooks do not carry visibility; forward their requests regardless of focus.
        if (event.client === 'chatgpt' || (event.client !== undefined && !['vscode', 'cli', 'unknown'].includes(event.client as string))) continue;
        const time = Date.parse(event.occurredAt);
        if (!Number.isFinite(time) || time < this.armedAt || time > Date.now() + 60000 || this.seen.has(event.id)) continue;
        this.seen.add(event.id);
        if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
        this.update({ status: 'watching', error: null, lastAttentionAt: event.occurredAt });
        this.options.onNotice({ id: event.id, source: 'codex', kind: event.kind as 'question' | 'approval', occurredAt: event.occurredAt });
      } finally { await rm(filename, { force: true }); }
    }
    if (this.state.status === 'error') this.update({ status: this.state.lastAttentionAt ? 'watching' : 'starting', error: null });
  }
  async drain(): Promise<void> { await this.serial.catch(() => {}); }
  async removeForUninstall(): Promise<void> {
    await this.configure(false, this.configured);
    if (this.state.status === 'error') throw new Error('无法移除 DesktopPet 的 Codex hook；请先在提醒设置中关闭接入后重试卸载。');
  }
  pause(): void { this.paused = true; clearInterval(this.timer); void this.serial.finally(() => rm(path.join(this.inbox, 'active'), { force: true })).catch(() => {}); }
  dispose(): void { this.disposed = true; clearInterval(this.timer); void this.serial.finally(() => rm(path.join(this.inbox, 'active'), { force: true })).catch(() => {}); }
}
