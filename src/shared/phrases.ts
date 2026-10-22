import type { PetPersona, PhraseDisplay } from './types';

export const defaultPhraseDisplay = (lines: string[]): PhraseDisplay => ({ count: lines.length, mode: 'sequential', selectedIndices: lines.map((_, index) => index) });
export const phraseDisplays = (phrases: Record<PetPersona, string[]>) => Object.fromEntries(Object.entries(phrases).map(([persona, lines]) => [persona, defaultPhraseDisplay(lines)])) as Record<PetPersona, PhraseDisplay>;
const safeRecord = (value: unknown, names: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === names.length && names.every(name => { const descriptor = Object.getOwnPropertyDescriptor(value, name); return descriptor && Object.hasOwn(descriptor, 'value'); });

export function validatePhraseDisplays(value: unknown, phrases?: Record<PetPersona, string[]>): asserts value is Record<PetPersona, PhraseDisplay> {
  if (!safeRecord(value, ['whale', 'gpt', 'dragon'])) throw new Error('短句展示设置无效');
  for (const persona of ['whale', 'gpt', 'dragon'] as const) {
    const config = (value as Record<PetPersona, PhraseDisplay>)[persona];
    if (!safeRecord(config, ['count', 'mode', 'selectedIndices']) || !Number.isInteger(config.count) || config.count < 0 || config.count > 20 || !['sequential', 'random'].includes(config.mode) || !Array.isArray(config.selectedIndices) || new Set(config.selectedIndices).size !== config.selectedIndices.length || config.selectedIndices.some(index => !Number.isInteger(index) || index < 0 || index >= (phrases?.[persona].length ?? 20))) throw new Error('短句展示设置无效');
    if (config.selectedIndices.length < config.count) throw new Error('候选短句数不能少于每轮展示数量');
  }
}

/** One stable batch per round. Cursor advances only when a phrase is actually viewed. */
export class PhrasePlayback {
  private cursors: Partial<Record<PetPersona, number>> = {};
  private batch: number[] = [];
  private owner: PetPersona = 'whale';
  private pool: number[] = [];
  private mode: PhraseDisplay['mode'] = 'sequential';
  constructor(private random = Math.random) {}
  begin(persona: PetPersona, config: PhraseDisplay): void {
    this.owner = persona; this.pool = [...config.selectedIndices].sort((a, b) => a - b); this.mode = config.mode;
    if (config.mode === 'random') {
      const shuffled = [...this.pool];
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      this.batch = shuffled.slice(0, config.count);
    } else this.batch = Array.from({ length: Math.min(config.count, this.pool.length) }, (_, offset) => this.pool[((this.cursors[persona] ?? 0) + offset) % this.pool.length]);
  }
  lines(phrases: string[]): string[] { return this.batch.map(index => phrases[index]).filter(line => line !== undefined); }
  viewed(index: number): void {
    if (this.mode === 'sequential' && index >= 0 && index < this.batch.length) this.cursors[this.owner] = (this.pool.indexOf(this.batch[index]) + 1) % this.pool.length;
  }
}
