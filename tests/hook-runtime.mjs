// Isolated real Codex runtime probe. Fake model responses stay on loopback; no login or paid inference.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const binary = process.env.DESKTOPPLAY_HOOK_TEST_CODEX;
if (!binary || !path.isAbsolute(binary)) throw new Error('Set DESKTOPPLAY_HOOK_TEST_CODEX to the runtime to verify.');
await mkdir('.tmp', { recursive: true });
const root = await mkdtemp(path.resolve(".tmp/t013-runtime path-$'-")), home = path.join(root, 'home'), cwd = path.join(root, 'workspace');
await mkdir(home); await mkdir(cwd);
await build({ entryPoints: ['src/main/services/codex-attention.ts'], outfile: path.join(root, 'service.mjs'), platform: 'node', format: 'esm', bundle: true });
const { CodexAttentionService } = await import(pathToFileURL(path.join(root, 'service.mjs')).href);
const cli = process.argv.includes('--cli');
const notices = [], observer = new CodexAttentionService({ dataDir: path.join(root, 'pet'), helperPath: path.resolve('build/conversation-hook.ps1'), onNotice: notice => { notices.push(notice); if (cli) { console.log('CLI hook relay:', notice.kind); if (notice.kind === 'question') requestedTool = 'exec_command'; } }, pollMs: cli ? 250 : 100000 });
await observer.configure(true, home);
let requestedTool = 'request_user_input', requests = 0;
const server = createServer(async (request, response) => {
  for await (const _ of request) { /* Never log prompt bodies. */ }
  requests++;
  if (!request.url?.includes('responses')) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [] })); return; }
  const callId = `call_${requests}`;
  const args = requestedTool === 'request_user_input' ? { questions: [{ id: 'choice', header: 'Test', question: 'Isolated fixture?', options: [{ label: 'One', description: 'First' }, { label: 'Two', description: 'Second' }] }] } : { cmd: 'Write-Output isolated-fixture', sandbox_permissions: 'require_escalated', justification: 'Isolated fixture approval' };
  const item = { type: 'function_call', id: callId, call_id: callId, name: requestedTool, arguments: JSON.stringify(args) };
  const events = [
    { type: 'response.created', response: { id: `resp_${requests}`, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: callId, output_index: 0, delta: item.arguments },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: `resp_${requests}`, status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
  response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const config = `model = "hook-test-model"\nmodel_provider = "fixture"\n[model_providers.fixture]\nname = "Local isolated fixture"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`;
await writeFile(path.join(home, 'config.toml'), config);
const env = { ...process.env, CODEX_HOME: home }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; delete env.CHATGPT_AUTH_TOKEN; delete env.ELECTRON_RUN_AS_NODE;
if (cli) {
  console.log('CLI fixture CODEX_HOME:', home);
  console.log('Only synthetic questions and approval requests will be emitted; cancel the approval rather than executing it.');
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !['question', 'approval'].every(kind => notices.some(notice => notice.kind === kind))) await new Promise(resolve => setTimeout(resolve, 250));
  console.log('CLI observed:', notices.map(notice => notice.kind).join(','));
  observer.dispose(); await observer.drain(); server.closeAllConnections(); server.close();
  if (!['question', 'approval'].every(kind => notices.some(notice => notice.kind === kind))) process.exitCode = 1;
} else {
const child = spawn(binary, ['app-server', '--stdio'], { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let pending = '', sequence = 0; const replies = new Map(), events = []; let stderr = '';
child.stderr.on('data', bytes => { stderr += bytes.toString(); });
child.stdout.on('data', bytes => {
  pending += bytes.toString(); let end;
  while ((end = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, end); pending = pending.slice(end + 1);
    try { const value = JSON.parse(line); if (value.method) events.push(value); else if (replies.has(value.id)) { replies.get(value.id)(value); replies.delete(value.id); } } catch { /* only protocol lines */ }
  }
});
const rpc = async (method, params) => {
  const id = ++sequence, reply = new Promise(resolve => replies.set(id, resolve));
  child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  let timeout;
  const result = await Promise.race([reply, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Timeout ${method}`)), 15000); })]).finally(() => clearTimeout(timeout));
  if (result.error) throw new Error(`${method}: ${JSON.stringify(result.error)}`); return result.result;
};
try {
  await rpc('initialize', { clientInfo: { name: 'desktoppet_hook_fixture', version: '1' }, capabilities: { experimentalApi: true } }); child.stdin.write('{"method":"initialized"}\n');
  const listed = await rpc('hooks/list', { cwds: [cwd] });
  console.log('Hook discovery:', JSON.stringify(listed.data?.map(entry => ({ errors: entry.errors, hooks: entry.hooks.map(hook => ({ event: hook.eventName, trust: hook.trustStatus })) }))));
  for (const kind of ['untrusted', 'question', 'approval', 'relay-failure']) {
    if (kind === 'relay-failure') { observer.pause(); await observer.drain(); }
    const before = notices.length;
    requestedTool = kind === 'question' || kind === 'untrusted' ? 'request_user_input' : 'exec_command';
    const thread = await rpc('thread/start', { cwd, model: 'hook-test-model', modelProvider: 'fixture', approvalPolicy: 'on-request', sandbox: 'read-only', config: { bypass_hook_trust: kind !== 'untrusted' } });
    await rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Run the isolated fixture tool.' }], collaborationMode: { mode: 'plan', settings: { model: 'hook-test-model', reasoning_effort: 'low', developer_instructions: null } } });
    const deadline = Date.now() + 20000;
    const delivered = () => kind === 'untrusted' || kind === 'relay-failure' ? events.some(event => event.method === (kind === 'untrusted' ? 'item/tool/requestUserInput' : 'item/commandExecution/requestApproval') && event.params.threadId === thread.thread.id) : notices.slice(before).some(notice => notice.kind === kind);
    while (Date.now() < deadline && !delivered()) { await observer.check(); await new Promise(resolve => setTimeout(resolve, 200)); }
    const received = delivered() && (!['untrusted', 'relay-failure'].includes(kind) || notices.length === before);
    console.log(`${kind}: ${kind === 'untrusted' ? 'questionPreservedWithoutRelay' : kind === 'relay-failure' ? 'approvalPreserved' : 'relay'}=${received}; modelRequests=${requests}; protocolMethods=${[...new Set(events.map(event => event.method))].join(',')}`);
    await rpc('turn/interrupt', { threadId: thread.thread.id, turnId: events.findLast(event => event.method === 'turn/started' && event.params.threadId === thread.thread.id)?.params.turn.id });
    if (!received) { console.log('Runtime errors:', events.filter(event => /error|warning|hook\//i.test(event.method)).map(event => JSON.stringify(event.params)).join('\n').slice(0,6500)); throw new Error(`No ${kind} relay from real runtime`); }
  }
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify({ binary, untrustedHookPreservesQuestion: true, question: true, approval: true, relayFailurePreservesApproval: true, model: 'loopback synthetic fixture', noticeKinds: notices.map(notice => notice.kind) }, null, 2));
} catch (error) { console.error(error.message); console.error(stderr.slice(-3000)); process.exitCode = 1; }
finally { child.kill(); observer.dispose(); await observer.drain(); server.closeAllConnections(); server.close(); console.log('Evidence directory:', path.relative(process.cwd(), root)); }
}
