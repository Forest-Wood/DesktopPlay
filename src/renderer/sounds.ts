import { builtinSound } from '../shared/bubble-settings';
import type { AppState, DesktopApi, PetPersona, SoundSlot } from '../shared/types';

type AudioHandle = Pick<HTMLAudioElement, 'volume' | 'currentTime' | 'play' | 'pause'> & Partial<Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener'>>;
type SoundApi = Pick<DesktopApi, 'getSoundData'>;


/** Keeps only the active persona in memory and invalidates delayed loads/playbacks. */
export class PersonaSoundPlayer {
  private identity = '';
  private generation = 0;
  private playback = 0;
  private disposed = false;
  private entries = new Map<SoundSlot, Promise<{ audio: AudioHandle; custom: boolean } | null>>();
  private loaded = new Set<AudioHandle>();
  private finishers = new Set<() => void>();
  constructor(private api: SoundApi, private warning: (slot: SoundSlot, text: string) => void, private createAudio: (url: string) => AudioHandle = url => new Audio(url), private slots: SoundSlot[] = ['press', 'release']) {}

  sync(persona: PetPersona, sounds: AppState['sounds']): void {
    const metadata = sounds[persona];
    const identity = `${persona}:${this.slots.map(slot => metadata[slot].revision).join(':')}`;
    if (this.disposed || this.identity === identity) return;
    this.stop(); this.loaded.clear(); this.entries.clear(); this.identity = identity;
    const generation = ++this.generation;
    for (const slot of this.slots) {
      const entry = this.api.getSoundData(persona, slot).then(result => {
        if (this.disposed || generation !== this.generation) return null;
        if (result.warning) this.warning(slot, result.warning);
        return { audio: this.createAudio(result.url), custom: metadata[slot].isCustom && !result.warning };
      }).catch(() => {
        if (this.disposed || generation !== this.generation) return null;
        this.warning(slot, '音效读取失败，已使用内置音效。');
        return { audio: this.createAudio(builtinSound(slot)), custom: false };
      }).then(entry => {
        if (this.disposed || generation !== this.generation) { entry?.audio.pause(); return null; }
        if (entry) this.loaded.add(entry.audio);
        return entry;
      });
      this.entries.set(slot, entry);
    }
  }

  async play(slot: SoundSlot, volume: number, waitForEnd = false): Promise<void> {
    if (this.disposed || volume <= 0) return;
    const generation = this.generation, playback = this.playback;
    const entry = await this.entries.get(slot);
    if (!entry || this.disposed || generation !== this.generation || playback !== this.playback) return;
    entry.audio.volume = Math.max(0, Math.min(1, volume)); entry.audio.currentTime = 0;
    try { await this.playAudio(entry.audio, waitForEnd); }
    catch {
      if (this.disposed || generation !== this.generation || playback !== this.playback) return;
      if (!entry.custom) { this.warning(slot, '内置音效暂时无法播放。'); return; }
      entry.audio.pause();
      const audio = this.createAudio(builtinSound(slot)); this.loaded.add(audio);
      audio.volume = Math.max(0, Math.min(1, volume));
      this.entries.set(slot, Promise.resolve({ audio, custom: false }));
      this.warning(slot, '自定义音效无法播放，已使用内置音效。');
      try { await this.playAudio(audio, waitForEnd); } catch { if (!this.disposed && generation === this.generation) this.warning(slot, '音效无法播放，请重新选择音频文件。'); }
    }
  }

  private async playAudio(audio: AudioHandle, wait: boolean): Promise<void> {
    let done = () => {};
    const ended = new Promise<void>(resolve => {
      done = () => { audio.removeEventListener?.('ended', done); audio.removeEventListener?.('error', done); this.finishers.delete(done); resolve(); };
      if (wait && audio.addEventListener) { this.finishers.add(done); audio.addEventListener('ended', done); audio.addEventListener('error', done); }
      else resolve();
    });
    try { await audio.play(); if (wait) await ended; } finally { done(); }
  }
  stop(): void { this.playback++; for (const done of [...this.finishers]) done(); for (const audio of this.loaded) { audio.pause(); audio.currentTime = 0; } }
  dispose(): void { this.stop(); this.disposed = true; this.generation++; this.entries.clear(); this.loaded.clear(); }
}
