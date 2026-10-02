export interface AppSettings {
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  snapToEdges: boolean;
  scale: number;
  soundEnabled: boolean;
  volume: number;
  phrases: string[];
  lowBalanceThreshold: string | null;
  dailyBudget: string | null;
}

export interface BalanceSnapshot {
  currency: 'CNY' | 'USD';
  total: string;
  granted: string;
  toppedUp: string;
  observedAt: string;
  isAvailable: boolean;
}

export interface DaySummary {
  date: string;
  currency: 'CNY' | 'USD';
  spent: string;
  increased: string;
  startedAt: string;
}

export interface LedgerSummary {
  today: DaySummary | null;
  history: DaySummary[];
}

export interface AlertNotice {
  id: string;
  kind: 'low-balance' | 'daily-budget';
  message: string;
}

export interface ServiceState {
  settings: AppSettings;
  hasApiKey: boolean;
  balance: BalanceSnapshot | null;
  ledger: LedgerSummary;
  status: 'unconfigured' | 'loading' | 'ready' | 'error';
  error: string | null;
  warning: string | null;
  alert: AlertNotice | null;
}

export interface PetAsset {
  name: string;
  url: string;
  isCustom: boolean;
}

export interface AppState extends ServiceState {
  pet: PetAsset;
  flipped: boolean;
  effectiveScale?: number;
}

export interface DesktopApi {
  getState(): Promise<AppState>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppState>;
  setApiKey(key: string): Promise<AppState>;
  clearApiKey(): Promise<AppState>;
  refreshBalance(): Promise<AppState>;
  choosePet(): Promise<AppState>;
  resetPet(): Promise<AppState>;
  openSettings(): Promise<void>;
  showMenu(): Promise<void>;
  hidePet(): Promise<void>;
  quit(): Promise<void>;
  startDrag(): void;
  endDrag(): void;
  setInteractive(interactive: boolean): void;
  setBubbleVisible(visible: boolean): void;
  onState(callback: (state: AppState) => void): () => void;
}

declare global { interface Window { desktopPlay: DesktopApi; } }
