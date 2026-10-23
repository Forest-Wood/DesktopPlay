import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensurePullRequest, runCli, validatePullRequest } from '../../scripts/github-pr.mjs';

const payload = { title: '诊断记录', head: 'docs/T018-example', base: 'main', body: '第一段\n\n第二段', draft: false };
const pr = { number: 42, html_url: 'https://github.com/Forest-Wood/DesktopPlay/pull/42', state: 'open', draft: false, head: { ref: payload.head, sha: 'fixture-sha' }, base: { ref: 'main' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('GitHub PR workflow', () => {
  it('reuses an open PR without another write', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([pr]));
    const result = await ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-token' });
    expect(result).toMatchObject({ created: false, number: 42, base: 'main' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('head')).toBe(`Forest-Wood:${payload.head}`);
    expect(options?.method).toBe('GET');
    expect(options?.redirect).toBe('error');
  });
  it('queries first, creates once, and preserves real newlines in the body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(pr, 201));
    expect(await ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-token' })).toMatchObject({ created: true, url: pr.html_url });
    expect(fetchImpl.mock.calls.map(call => call[1]?.method)).toEqual(['GET', 'POST']);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual(payload);
  });
  it('refuses a different base instead of creating another PR or retargeting it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([{ ...pr, base: { ref: 'release/fixture' } }]));
    await expect(ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-token' })).rejects.toThrow('其他 base');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], { ...payload, title: '' }, { ...payload, body: '' }, { ...payload, draft: 'false' }, { ...payload, head: 'main' }, { ...payload, base: 'bad\nbranch' }, { ...payload, head: '../branch' }, { ...payload, token: 'must-not-be-used' }])('rejects invalid input before credentials or network: %j', async input => {
    const getCredential = vi.fn(), fetchImpl = vi.fn<typeof fetch>();
    await expect(ensurePullRequest(input, { fetchImpl, getCredential })).rejects.toThrow();
    expect(getCredential).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('sanitizes credential and request errors, with no automatic POST retry', async () => {
    const getCredential = vi.fn(() => { throw new Error('fake-private-token'); });
    const credentialFailure = ensurePullRequest(payload, { getCredential });
    await expect(credentialFailure).rejects.toThrow('无法读取已有');
    await expect(credentialFailure).rejects.not.toThrow('fake-private-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json([])).mockRejectedValueOnce(new Error('fake-private-token'));
    const requestFailure = ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-private-token' });
    await expect(requestFailure).rejects.toThrow('POST 请求失败或超时');
    await expect(requestFailure).rejects.not.toThrow('fake-private-token');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('stops on permission errors without exposing response bodies or credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ message: 'fake-private-token' }, 403));
    const permissionFailure = ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-private-token' });
    await expect(permissionFailure).rejects.toThrow('HTTP 403');
    await expect(permissionFailure).rejects.not.toThrow('fake-private-token');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('checks payload locally without invoking creation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desktopplay-pr-')); roots.push(root);
    const file = path.join(root, 'PR.json'); await writeFile(file, JSON.stringify(payload));
    const create = vi.fn(), output = vi.fn();
    await runCli([file, '--check'], { create, output });
    expect(create).not.toHaveBeenCalled();
    expect(JSON.parse(output.mock.calls[0][0])).toEqual({ checked: true, repository: 'Forest-Wood/DesktopPlay', head: payload.head, base: 'main' });
  });
  it('validates response identity and rejects ambiguous results', async () => {
    for (const response of [[pr, pr], [{ ...pr, html_url: 'https://example.invalid/42' }], { unexpected: true }]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(response));
      await expect(ensurePullRequest(payload, { fetchImpl, getCredential: () => 'fake-token' })).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    expect(validatePullRequest({ ...payload, draft: undefined }).draft).toBe(false);
  });
});
