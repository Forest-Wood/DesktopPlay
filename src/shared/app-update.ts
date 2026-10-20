import type { AppUpdateState } from './types';
import { APP_VERSION } from './defaults';

export function initialUpdateState(kind: AppUpdateState['kind'] = 'unsupported', version = APP_VERSION): AppUpdateState {
  return { kind, status: kind === 'unsupported' ? 'unsupported' : 'idle', currentVersion: version,
    latestVersion: null, releaseNotes: '', releaseDate: null, checkedAt: null, progress: 0, transferred: 0, total: 0,
    error: kind === 'unsupported' ? '开发或演示模式不执行软件更新。' : null };
}
