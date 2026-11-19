import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { GeminiWaiting, conversationTurn } from './gemini-waiting';
import type { ConversationNotice } from '../../shared/types';

const GROUP = 'DesktopPet-Gemini';
export class GeminiNotices {
  status = '未开启 Gemini 接入';
  private serial = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private key = '';
  private since = Date.now();
  private seen = new Set<string>();
  private waiting?: GeminiWaiting;
  private inbox: string;
  private polling?: Promise<void>;
  private generation = 0;
  constructor(private home: string, dataDir: string, private helper: string, private notice: (n: ConversationNotice) => void, private publish: () => void) {
    this.inbox = path.join(dataDir, 'integrations', 'gemini', 'inbox');
  }
  private report(text: string) { if (this.status !== text) { this.status = text; this.publish(); } }
  configure(hook: boolean, completion: boolean, attention: boolean): Promise<void> {
    const key = [hook, completion, attention].join('/');
    const generation = this.generation;
    this.serial = this.serial.then(async () => {
      if (generation !== this.generation) return;
      if (this.key === key) return;
      const old = this.key; this.key = ''; clearInterval(this.timer); await this.polling;
      this.since = Date.now(); this.seen.clear();
      try {
        if (hook || old.startsWith('true') || existsSync(path.join(path.dirname(this.inbox), 'stop.ps1'))) await this.install(hook);
        if (this.generation !== generation) return;
        this.key = key;
        this.waiting = attention ? new GeminiWaiting(this.home, this.since) : undefined;
        const poll = async () => {
          if (this.key !== key) return;
          try {
            if (hook) await this.scan(completion, key);
            if (this.key !== key) return;
            const status = this.waiting?.scan(this.notice);
            this.report([hook ? '完成 hook 已接入' : '完成 hook 未接入', status ?? '等待提醒已关闭'].join(' · '));
          } catch { if (this.key === key) this.report('无法读取 Gemini 事件，将自动重试。'); }
        };
        if (hook || attention) {
          await poll();
          if (generation !== this.generation) return;
          this.timer = setInterval(() => {
            if (!this.polling) this.polling = poll().finally(() => { this.polling = undefined; });
          }, 2000);
        }
        else this.report('Gemini 监听已关闭');
      } catch { this.key = ''; this.report('Gemini hook 配置有冲突或不可写，请检查 hooks.json 后重新保存。'); }
    });
    return this.serial;
  }
  private async install(enable: boolean) {
    const target = path.join(this.home, 'config', 'hooks.json');
    const script = path.join(path.dirname(this.inbox), 'stop.ps1');
    const command = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + script + '"';
    const group = { Stop: [{ type: 'command', command, timeout: 5 }] };
    const read = () => readFile(target, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return null; });
    const original = await read(), config = JSON.parse(original?.replace(/^\uFEFF/, '') ?? '{}');
    if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('invalid hooks');
    if (Object.hasOwn(config, GROUP)) {
      const { enabled: _enabled, ...existing } = config[GROUP] ?? {};
      if (JSON.stringify(existing) !== JSON.stringify(group)) {
        if (!enable) return;
        throw new Error('hook name conflict');
      }
    }
    if (enable) {
      await mkdir(this.inbox, { recursive: true });
      const source = (await readFile(this.helper, 'utf8')).replace('__INBOX__', () => this.inbox.replaceAll("'", "''"));
      await writeFile(script, '\uFEFF' + source, 'utf8');
      if (config[GROUP]) return;
      config[GROUP] = group;
    } else { if (!config[GROUP]) return; delete config[GROUP]; }
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = target + '.DesktopPet-' + randomUUID();
    try {
      await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
      if (await read() !== original) throw new Error('concurrent change');
      await rename(tmp, target);
    } finally { await rm(tmp, { force: true }); }
  }
  private async scan(enabled: boolean, key: string) {
    await writeFile(path.join(this.inbox, 'active'), '');
    for (const name of await readdir(this.inbox)) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
      const file = path.join(this.inbox, name);
      try {
        if (!enabled || (await stat(file)).size > 4096) continue;
        const ev = JSON.parse(await readFile(file, 'utf8')), time = Date.parse(ev.at);
        if (!Number.isFinite(time) || time < this.since || time > Date.now() + 5000 || !Number.isSafeInteger(ev.execution) || typeof ev.conversation !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(ev.conversation)) continue;
        const meta = conversationTurn(this.home, ev.conversation);
        if (meta?.child) continue;
        const id = createHash('sha256').update([ev.conversation, meta?.turn ?? '', ev.execution].join('/')).digest('hex');
        if (this.key !== key || this.seen.has(id)) continue;
        this.seen.add(id); if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
        this.notice({ source: 'antigravity', id, kind: 'completion', occurredAt: new Date(time).toISOString() });
      } finally { await rm(file, { force: true }); }
    }
  }
  pause() { this.generation++; this.key = ''; clearInterval(this.timer); }
  async drain() { await this.serial; await this.polling; }
  async removeForUninstall() {
    this.pause(); await this.drain();
    if (existsSync(path.join(path.dirname(this.inbox), 'stop.ps1'))) await this.install(false);
  }
}
