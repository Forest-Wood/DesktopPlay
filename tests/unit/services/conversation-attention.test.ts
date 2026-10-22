import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, appendFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CodexAttentionService } from '../../../src/main/services/codex-attention';
import { parseChatgptAttention, ChatgptCompletionService } from '../../../src/main/services/chatgpt-completion';
import { DeepseekCompletionService } from '../../../src/main/services/deepseek-completion';
import { DesktopService } from '../../../src/main/services/desktop-service';
import type { ConversationNotice } from '../../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../../src/shared/defaults';
import { zstdCompressSync } from 'node:zlib';

const roots: string[] = [], dispose: (() => void)[] = [];
async function fixture() { await mkdir('.tmp', { recursive: true }); const root = await mkdtemp(path.resolve('.tmp/attention-unit-')); roots.push(root); return root; }
afterEach(async () => { for (const stop of dispose.splice(0)) stop(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const native = (kind: string, id: string, at = Date.now()) => `${new Date(at).toISOString()} info [desktop-notifications] forward show kind=${kind} notificationId=${id}\n`;
describe('conversation attention sources and compatibility', () => {
  it('recognizes only known Work user-facing IDs and never keeps account fields', () => {
    expect(parseChatgptAttention(native('question', 'question-durable-42'))?.kind).toBe('question');
    expect(parseChatgptAttention(native('permission', 'approval-durable-43'))?.kind).toBe('approval');
    const parsed = parseChatgptAttention(native('question', 'async-question-["private-account","private-user","durable","thread","turn","item"]'));
    expect(parsed?.turn).toBe('question:item'); expect(JSON.stringify(parsed)).not.toContain('private');
    for (const line of [native('question', 'question-local-42'), native('permission', 'approval-remote-42'), native('question', 'unknown'), native('question', 'question-durable-42').replace('forward show', 'suppressed question')]) expect(parseChatgptAttention(line)).toBeNull();
  });
  it('skips old Work events, emits both kinds once and excludes completion callbacks', async () => {
    const root = await fixture(), file = path.join(root, 'desktop.log'), events: ConversationNotice[] = [];
    await writeFile(file, native('question', 'question-durable-history'));
    const service = new ChatgptCompletionService({ onNotice: () => { throw new Error('unexpected completion'); }, onAttention: event => events.push(event), pollMs: 100000 }); dispose.push(() => service.dispose());
    await service.configure(true, [root]);
    await appendFile(file, native('question', 'question-durable-new') + native('permission', 'approval-durable-new')); await service.check(); await service.check();
    expect(events.map(event => event.kind)).toEqual(['question', 'approval']); expect(events.every(event => /^[a-f0-9]{64}$/.test(event.id))).toBe(true);
  });
  it.each([false, true])('reads DSH question/approval metadata, skips history and deduplicates (compressed %s)', async compressed => {
    const root = await fixture(), file = path.join(root, `session.v4.jsonl${compressed ? '.zstd' : ''}`), events: ConversationNotice[] = [];
    const header = JSON.stringify({ type: 'session', version: 4, id: 'root', isSeeded: false, delegationDepth: 0 }) + '\n';
    const encode = (text: string) => compressed ? zstdCompressSync(Buffer.from(text)) : text;
    await writeFile(file, encode(header));
    const service = new DeepseekCompletionService({ onNotice: () => {}, onAttention: event => events.push(event), pollMs: 100000 }); dispose.push(() => service.dispose()); await service.configure(true, root);
    const at = Date.now() + 2;
    const rows = [{ type: 'tool/call', seq: 1, time: at, data: { turn: 1, name: 'ask_user_question', callId: 'q', arguments: 'PRIVATE BODY' } }, { type: 'approval/asked', seq: 2, time: at, data: { id: 'a', reason: 'PRIVATE BODY' } }].map(row => JSON.stringify(row) + '\n').join('');
    await appendFile(file, encode(rows + rows)); await service.check();
    expect(events.map(event => event.kind)).toEqual(['question', 'approval']); expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
  it('installs idempotently, preserves foreign hooks and removes only owned entries', async () => {
    const root = await fixture(), home = path.join(root, 'home'), events: ConversationNotice[] = []; await mkdir(home);
    const original = { description: 'foreign', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'foreign-command' }] }] } };
    await writeFile(path.join(home, 'hooks.json'), JSON.stringify(original));
    const service = new CodexAttentionService({ dataDir: root, helperPath: path.resolve('build/conversation-hook.ps1'), onNotice: notice => events.push(notice), pollMs: 100000 }); dispose.push(() => service.dispose());
    await service.configure(true, home); await service.configure(true, home);
    const config = JSON.parse(await readFile(path.join(home, 'hooks.json'), 'utf8')); expect(config.hooks.PreToolUse).toHaveLength(2); expect(config.hooks.PermissionRequest).toHaveLength(1);
    const script = path.join(root, 'integrations/codex/conversation-hook.ps1');
    const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'request_user_input', session_id: 'fake-session', turn_id: 'fake-turn', tool_use_id: 'fake-call', tool_input: { questions: ['PRIVATE BODY'] } });
    await new Promise<void>((resolve, reject) => { const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], error => error ? reject(error) : resolve()); child.stdin!.end(input); });
    await service.check(); expect(events).toHaveLength(1); expect(events[0].kind).toBe('question'); expect(JSON.stringify(events)).not.toContain('PRIVATE');
    await service.configure(false, home); expect(JSON.parse(await readFile(path.join(home, 'hooks.json'), 'utf8'))).toEqual(original);
    await new Promise<void>((resolve, reject) => { const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], (error, stdout) => { expect(stdout).toBe(''); error ? reject(error) : resolve(); }); child.stdin!.end(input); });
  });
  it('reports an incompatible runtime without writing its hook configuration', async () => {
    const root = await fixture(), home = path.join(root, 'missing-home');
    const service = new CodexAttentionService({ dataDir: root, helperPath: path.resolve('build/conversation-hook.ps1'), onNotice: () => {}, isSupported: async () => false }); dispose.push(() => service.dispose());
    await service.configure(true, home); expect(service.getState().status).toBe('unavailable');
    await expect(readFile(path.join(home, 'hooks.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('migrates old profiles and phrase choices, persists new fields and rejects invalid settings atomically', async () => {
    const root = await fixture(), old = structuredClone(DEFAULT_SETTINGS) as any;
    delete old.phraseDisplayByPersona; delete old.attentionEnabledBySource; delete old.codexHookEnabled;
    old.phrasesByPersona.whale = ['first', 'second'];
    for (const profile of Object.values(old.bubbleProfilesByPersona) as any[]) for (const key of Object.keys(profile.rules)) if (key.startsWith('attention-')) delete profile.rules[key];
    await writeFile(path.join(root, 'desktopplay.json'), JSON.stringify({ version: 1, settings: old, key: null, accounts: {} }));
    const service = new DesktopService({ dataDir: root, secrets: { isEncryptionAvailable: () => true, encryptString: Buffer.from, decryptString: b => b.toString() } }); dispose.push(() => service.dispose()); await service.init();
    const migrated = service.getState().settings; expect(migrated.phraseDisplayByPersona.whale.count).toBe(2); expect(migrated.bubbleProfilesByPersona.whale.rules['attention-codex']).toBeDefined();
    const displays = structuredClone(migrated.phraseDisplayByPersona); displays.whale = { count: 1, mode: 'random', selectedIndices: [1] };
    await service.updateSettings({ phraseDisplayByPersona: displays }); const disk = await readFile(path.join(root, 'desktopplay.json'), 'utf8');
    await expect(service.updateSettings({ phraseDisplayByPersona: { ...displays, whale: { ...displays.whale, count: 2 } } })).rejects.toThrow();
    const unsafe = Object.defineProperty({ ...displays }, 'whale', { get() { throw new Error('getter must not run'); } });
    await expect(service.updateSettings({ phraseDisplayByPersona: unsafe })).rejects.toThrow('短句展示设置无效');
    expect(await readFile(path.join(root, 'desktopplay.json'), 'utf8')).toBe(disk);
  });
});
