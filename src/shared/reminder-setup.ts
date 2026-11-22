import { sourceEnabled } from './bubble-settings';
import { geminiSummaryListening } from './reminder-health';
import type { AppState, CodexCompletionState, CompletionSource } from './types';

type SetupState = Pick<AppState, 'settings' | 'codexCompletion' | 'codexAttention' | 'chatgptCompletion' | 'deepseekCompletion' | 'geminiIntegration'>;
type SetupStep = { label: string; complete?: boolean };

function directoryMatches(actual: string, saved: string | null) {
  if (saved === null || actual === saved) return true;
  // The listeners resolve path separators and dot segments in saved Windows paths.
  const normalize = (directory: string) => {
    const url = new URL('file:///');
    url.pathname = directory.replace(/[\\/]+/g, '/').replaceAll('%', '%25');
    return url.pathname.replace(/\/$/, '');
  };
  return normalize(actual) === normalize(saved);
}

function isWatchingDirectory(listener: CodexCompletionState, directory: string | null) {
  return listener.status === 'watching' && directoryMatches(listener.directory, directory);
}

export function reminderSetupSteps(state: SetupState, source: CompletionSource): SetupStep[] {
  const settings = state.settings;
  const completion = sourceEnabled(settings, source);
  const attention = settings.attentionEnabledBySource[source];
  switch (source) {
    case 'codex': {
      const hook = state.codexAttention;
      const hookReady = settings.codexHookEnabled && (hook.status === 'starting' || hook.status === 'watching')
        && directoryMatches(hook.directory, settings.codexCompletionDirectory);
      return [
        { label: '选择包含 sessions 的 Codex 主目录。', complete: completion
          ? isWatchingDirectory(state.codexCompletion, settings.codexCompletionDirectory)
          : attention ? hookReady : undefined },
        { label: '等待回应使用 Codex Hook。启用后保存设置。', complete: attention ? hookReady : undefined },
        { label: '在原客户端的 /hooks 中审阅并信任 DesktopPet 转发项。' },
        { label: '重新加载客户端，触发一次提问或审批。', complete: attention ? hookReady && hook.status === 'watching' && !!hook.lastAttentionAt : undefined },
      ];
    }
    case 'chatgpt-work':
      return [
        { label: '启动 ChatGPT App，等待桌面通知日志接通。', complete: completion || attention ? state.chatgptCompletion.status === 'watching' : undefined },
        { label: '在 ChatGPT 通知设置中允许提问和权限通知，将回合结束通知设为“始终”。' },
        { label: '切换到其他会话或应用，再触发一次提问或审批。', complete: attention
          ? state.chatgptCompletion.status === 'watching' && !!state.chatgptCompletion.lastAttentionAt : undefined },
      ];
    case 'deepseek-harness':
      return [
        { label: '选择 DSH 会话目录并保存。默认读取 DSH_HOME/sessions 或 ~/.dsh/sessions。', complete: completion || attention
          ? isWatchingDirectory(state.deepseekCompletion, settings.deepseekCompletionDirectory) : undefined },
        { label: '在 DSH 开启一次会话，验证任务完成或等待回应提醒。' },
      ];
    case 'antigravity':
      return [
        { label: '打开 Antigravity，等待桌面端、VS Code 或 IDE 的本机会话摘要接通。', complete: completion || attention
          ? geminiSummaryListening(state.geminiIntegration) : undefined },
        { label: '如需补充 agy CLI 完成提醒，可启用完成 Hook 并保存。', complete: settings.geminiHookEnabled
          ? state.geminiIntegration.includes('完成 hook 已接入') : undefined },
        { label: '启用 Hook 后，在 Antigravity 重新加载会话并验证一次任务完成。' },
      ];
  }
}
