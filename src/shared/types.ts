export type PetPersona = 'whale' | 'gpt' | 'dragon';
export type SoundSlot = 'press' | 'release';
export interface SoundMetadata { name: string; isCustom: boolean; revision: string; warning: string | null }
export type SoundMetadataMap = Record<PetPersona, Record<SoundSlot, SoundMetadata>>;
export interface SoundData { url: string; revision: string; warning: string | null }
export interface UninstallInfo {
  kind: 'installed' | 'portable' | 'unsupported';
  programPath: string | null;
  dataPath: string;
  available: boolean;
  reason: string | null;
}
export interface AppSettings {
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  snapToEdges: boolean;
  scale: number;
  soundEnabled: boolean;
  volume: number;
  phrases: string[];
  phrasesByPersona: Record<PetPersona, string[]>;
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
  /** Pixel bounds in the original image; right/bottom are exclusive. */
  contentBounds?: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number };
}

export type BuiltinPetId = 'deepseek' | 'gpt';
export type GptAppearance = 'classic' | 'dragon' | 'custom';
export type BubblePlacement = 'above' | 'below';

export interface CodexQuotaWindow {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
}

export interface CodexQuotaBucket {
  id: string;
  name: string;
  planType: string | null;
  primary: CodexQuotaWindow | null;
  secondary: CodexQuotaWindow | null;
  creditsRemaining: string | null;
  unlimitedCredits: boolean;
}

export interface CodexQuotaState {
  planType: string | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  buckets: CodexQuotaBucket[];
  updatedAt: string | null;
  error: string | null;
  source: 'codex-app-server';
  available: boolean;
}

export interface AppState extends ServiceState {
  sounds: SoundMetadataMap;
  pet: PetAsset;
  activePet: BuiltinPetId;
  gptAppearance: GptAppearance;
  hasCustomGpt: boolean;
  codex: CodexQuotaState;
  flipped: boolean;
  verticalFlipped: boolean;
  bubblePlacement: BubblePlacement;
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
  chooseSound(persona: PetPersona, slot: SoundSlot): Promise<AppState>;
  resetSound(persona: PetPersona, slot: SoundSlot): Promise<AppState>;
  getSoundData(persona: PetPersona, slot: SoundSlot): Promise<SoundData>;
  getUninstallInfo(): Promise<UninstallInfo>;
  requestUninstall(removeData: boolean): Promise<{ started: boolean }>;
  selectPet(id: BuiltinPetId): Promise<AppState>;
  selectGptAppearance(id: GptAppearance): Promise<AppState>;
  refreshCodexQuota(): Promise<AppState>;
  chooseCodexExecutable(): Promise<AppState>;
  openCodexUsage(): Promise<void>;
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
