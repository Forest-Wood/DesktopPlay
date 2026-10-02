import { describe, expect, it, vi } from 'vitest';
import { PersonaSoundPlayer } from '../../../src/renderer/sounds';
import type { PetPersona, SoundData, SoundMetadataMap, SoundSlot } from '../../../src/shared/types';

const metadata = (): SoundMetadataMap => Object.fromEntries(['whale', 'gpt', 'dragon'].map(persona => [persona, Object.fromEntries(['press', 'release'].map(slot => [slot, { name: `${slot}.mp3`, isCustom: false, revision: `${persona}-${slot}-1`, warning: null }]))])) as SoundMetadataMap;
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const mockAudio = () => ({ volume: 1, currentTime: 0, play: vi.fn(async () => {}), pause: vi.fn() });
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('per-persona sound playback lifecycle', () => {
  it('loads only two sounds, reuses unchanged revisions, and stops audio on persona changes', async () => {
    const sounds = metadata(), audios: ReturnType<typeof mockAudio>[] = [];
    const getSoundData = vi.fn(async (persona: PetPersona, slot: SoundSlot): Promise<SoundData> => ({ url: `${persona}/${slot}`, revision: sounds[persona][slot].revision, warning: null }));
    const player = new PersonaSoundPlayer({ getSoundData }, vi.fn(), () => { const audio = mockAudio(); audios.push(audio); return audio; });
    player.sync('whale', sounds); await player.play('press', .4);
    expect(getSoundData).toHaveBeenCalledTimes(2); expect(audios[0]!.volume).toBe(.4);
    player.sync('whale', sounds); expect(getSoundData).toHaveBeenCalledTimes(2);
    player.sync('dragon', sounds); await tick();
    expect(audios[0]!.pause).toHaveBeenCalled(); expect(getSoundData).toHaveBeenCalledTimes(4);
    expect(getSoundData.mock.calls.map(call => call[0])).toEqual(['whale', 'whale', 'dragon', 'dragon']);
    player.dispose(); expect(audios[2]!.pause).toHaveBeenCalled();
  });

  it('never plays delayed data from an old persona, revision, stopped preview, or disposed player', async () => {
    const sounds = metadata(), pending: ReturnType<typeof deferred<SoundData>>[] = [], audios: ReturnType<typeof mockAudio>[] = [];
    const getSoundData = vi.fn(() => { const request = deferred<SoundData>(); pending.push(request); return request.promise; });
    const player = new PersonaSoundPlayer({ getSoundData }, vi.fn(), () => { const audio = mockAudio(); audios.push(audio); return audio; });
    player.sync('whale', sounds); const oldPlay = player.play('press', .5);
    sounds.whale.press.revision = 'new'; player.sync('whale', sounds);
    pending[0]!.resolve({ url: 'old', revision: 'old', warning: null }); pending[1]!.resolve({ url: 'old', revision: 'old', warning: null });
    await oldPlay; expect(audios).toHaveLength(0);
    const stopped = player.play('press', .5); player.stop();
    pending[2]!.resolve({ url: 'new', revision: 'new', warning: null }); pending[3]!.resolve({ url: 'new', revision: 'new', warning: null });
    await stopped; expect(audios.every(audio => audio.play.mock.calls.length === 0)).toBe(true);
    player.sync('gpt', sounds); const disposedPlay = player.play('release', .5); player.dispose();
    pending[4]!.resolve({ url: 'gone', revision: 'gone', warning: null }); pending[5]!.resolve({ url: 'gone', revision: 'gone', warning: null });
    await disposedPlay; expect(audios).toHaveLength(2);
  });

  it('falls back to built-in audio after a custom decode failure and surfaces a warning', async () => {
    const sounds = metadata(); sounds.gpt.press.isCustom = true;
    const created: { url: string; audio: ReturnType<typeof mockAudio> }[] = [], warning = vi.fn();
    const player = new PersonaSoundPlayer({ getSoundData: async (_persona, slot) => ({ url: `custom:${slot}`, revision: '1', warning: null }) }, warning, url => {
      const audio = mockAudio(); if (url === 'custom:press') audio.play.mockRejectedValue(new Error('decode failed'));
      created.push({ url, audio }); return audio;
    });
    player.sync('gpt', sounds); await player.play('press', .7);
    const fallback = created.find(entry => entry.url === './assets/press.mp3')!;
    expect(fallback.audio.play).toHaveBeenCalledTimes(1); expect(fallback.audio.volume).toBe(.7);
    expect(warning).toHaveBeenCalledWith('press', expect.stringContaining('内置音效'));
    await player.play('press', .3); expect(fallback.audio.play).toHaveBeenCalledTimes(2);
    player.dispose();
  });

  it('keeps zero volume muted and cancels further fallback after disposal', async () => {
    const sounds = metadata(), warning = vi.fn(), audio = mockAudio(), failure = deferred<void>();
    sounds.whale.press.isCustom = true; audio.play.mockImplementation(() => failure.promise);
    const createAudio = vi.fn(() => audio);
    const player = new PersonaSoundPlayer({ getSoundData: async (_persona, slot) => ({ url: slot, revision: '1', warning: null }) }, warning, createAudio);
    player.sync('whale', sounds); await player.play('press', 0); expect(audio.play).not.toHaveBeenCalled();
    const playing = player.play('press', .5); await tick(); player.dispose(); failure.reject(new Error('late decode failure')); await playing;
    expect(createAudio).toHaveBeenCalledTimes(2); expect(warning).not.toHaveBeenCalled();
  });
});
