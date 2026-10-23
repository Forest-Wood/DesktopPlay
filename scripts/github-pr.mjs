import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPOSITORY = 'Forest-Wood/DesktopPlay';
const ENDPOINT = `https://api.github.com/repos/${REPOSITORY}/pulls`;

export function validatePullRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PR 文件必须是 JSON 对象。');
  const allowed = ['title', 'head', 'base', 'body', 'draft'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('PR 文件只接受 title、head、base、body、draft。');
  for (const key of ['title', 'head', 'base', 'body']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`PR 缺少有效的 ${key}。`);
  }
  for (const key of ['head', 'base']) {
    if (/[\s~^:?*\[\\\x00-\x1f\x7f]/.test(value[key]) || value[key].includes('..') || value[key].includes('@{') || value[key].split('/').some(part => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) throw new Error(`PR ${key} 不是有效的本仓库分支名。`);
  }
  if (value.head === value.base) throw new Error('PR 的 head 和 base 不能相同。');
  if (value.draft !== undefined && typeof value.draft !== 'boolean') throw new Error('PR draft 必须为布尔值。');
  return { title: value.title, head: value.head, base: value.base, body: value.body, draft: value.draft ?? false };
}

function gitCredential() {
  const result = spawnSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (result.status !== 0) throw new Error('无法读取已有 GitHub Git 凭据；请先完成 Git 登录。');
  const fields = Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
  if (!fields.password) throw new Error('已有 GitHub Git 凭据中没有访问令牌。');
  return fields.password;
}

function summary(pr, payload, created) {
  if (!pr || !Number.isSafeInteger(pr.number) || pr.number < 1 || pr.html_url !== `https://github.com/${REPOSITORY}/pull/${pr.number}` || pr.head?.ref !== payload.head || pr.base?.ref !== payload.base || pr.state !== 'open') throw new Error('GitHub 返回的 PR 与目标仓库或分支不匹配。');
  return { created, number: pr.number, url: pr.html_url, head: pr.head.ref, headSha: pr.head.sha, base: pr.base.ref, draft: pr.draft };
}

export async function ensurePullRequest(input, { fetchImpl = fetch, getCredential = gitCredential } = {}) {
  const payload = validatePullRequest(input);
  let token;
  try { token = await getCredential(); } catch { throw new Error('无法读取已有 GitHub Git 凭据；请先完成 Git 登录。'); }
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('已有 GitHub Git 凭据不可用。');
  const request = async (url, method = 'GET') => {
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DesktopPet-PR', 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
      });
    } catch { throw new Error(`GitHub ${method} 请求失败或超时；重试会先查询现有 PR。`); }
    if (!response.ok) throw new Error(`GitHub ${method} 返回 HTTP ${response.status}；请核对 Git 凭据的仓库权限或请求内容。`);
    try { return await response.json(); } catch { throw new Error('GitHub 返回了无效 JSON。'); }
  };
  const query = new URLSearchParams({ state: 'open', head: `Forest-Wood:${payload.head}`, per_page: '100' });
  const existing = await request(`${ENDPOINT}?${query}`);
  if (!Array.isArray(existing)) throw new Error('GitHub PR 列表格式无效。');
  if (existing.length > 1) throw new Error('同一 head 有多个开放 PR；请先确认目标 PR。');
  if (existing.length) {
    if (existing[0].base?.ref !== payload.base) throw new Error('该 head 已有 PR 指向其他 base；请更新已有 PR，避免重复创建。');
    return summary(existing[0], payload, false);
  }
  return summary(await request(ENDPOINT, 'POST'), payload, true);
}

export async function runCli(args, { output = console.log, create = ensurePullRequest } = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { check: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) { output('npm.cmd run pr:create -- <PR.json> [--check]\n字段：title、head、base、body、draft（可选）。--check 不读取凭据或访问网络。'); return; }
  if (positionals.length !== 1) throw new Error('请提供一个 PR JSON 文件；使用 --help 查看用法。');
  let input;
  try { input = JSON.parse(readFileSync(positionals[0], 'utf8')); } catch { throw new Error('无法读取有效的 PR JSON 文件。'); }
  const payload = validatePullRequest(input);
  if (values.check) { output(JSON.stringify({ checked: true, repository: REPOSITORY, head: payload.head, base: payload.base })); return; }
  output(JSON.stringify(await create(payload)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runCli(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
